// High-level bot dispatcher. Decoupled from the transport (long-polling worker
// or webhook route) so we can call it from either path with the same logic.

import { prisma } from "./db";
import { ingestEvent } from "./miner";
import { runDrafterBatch } from "./drafter";
import { promoteDraftToLive } from "./armorpolicy";
import { listPendingDigest, listRatifiedPolicies } from "./digest";
import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
  type CallbackQuery,
  type TelegramMessage,
  type Update,
} from "./telegram";
import {
  formatAcceptedMessage,
  formatDismissedMessage,
  formatDraftCard,
  formatHelp,
  formatNoDrafts,
  formatRatifiedList,
  formatSimulateAck,
} from "./telegram-format";
import type { DigestCardSummary } from "./types";

const ORG = process.env.POLICYMIND_ORG_ID ?? "demo-org";
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? "PolicyMindBot";

export async function handleUpdate(update: Update): Promise<void> {
  if (update.message?.text) {
    await handleMessage(update.message);
    return;
  }
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }
}

async function handleMessage(msg: TelegramMessage): Promise<void> {
  const text = (msg.text ?? "").trim();
  if (!text.startsWith("/")) return;

  const [rawCmd, ...args] = text.split(/\s+/);
  // Strip @BotUsername suffixes some clients add.
  const cmd = rawCmd.split("@")[0].toLowerCase();

  await registerSubscriber(msg);

  switch (cmd) {
    case "/start":
      await sendMessage({
        chat_id: msg.chat.id,
        text:
          `<b>Subscribed.</b>\n\n` +
          `This chat is now wired to PolicyMind. New drafted policies will land here automatically.\n\n` +
          formatHelp(BOT_USERNAME),
      });
      return;

    case "/help":
      await sendMessage({ chat_id: msg.chat.id, text: formatHelp(BOT_USERNAME) });
      return;

    case "/digest":
      await sendDigestTo(String(msg.chat.id));
      return;

    case "/policies":
    case "/ledger": {
      const rows = await listRatifiedPolicies(ORG);
      await sendMessage({ chat_id: msg.chat.id, text: formatRatifiedList(rows) });
      return;
    }

    case "/simulate": {
      const tool = args[0] ?? "wire_transfer";
      const created = await runSimulate(tool);
      await sendMessage({ chat_id: msg.chat.id, text: formatSimulateAck(created) });
      // Push the freshly drafted policy cards into this chat right away.
      await sendDigestTo(String(msg.chat.id));
      return;
    }

    case "/reset": {
      await prisma.ratifiedPolicy.deleteMany();
      await prisma.policyDraft.deleteMany();
      await prisma.auditEvent.deleteMany();
      await prisma.eventCluster.deleteMany();
      await prisma.telegramDraftMessage.deleteMany();
      await sendMessage({
        chat_id: msg.chat.id,
        text: "♻️ <b>Reset.</b> All events, drafts and ratified policies cleared.",
      });
      return;
    }

    default:
      await sendMessage({
        chat_id: msg.chat.id,
        text: `Unknown command <code>${cmd}</code>. Try /help.`,
      });
  }
}

async function handleCallback(cb: CallbackQuery): Promise<void> {
  const data = cb.data ?? "";
  const [action, draftId] = data.split(":");
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  if (!chatId || !messageId || !draftId) {
    await answerCallbackQuery({ callback_query_id: cb.id, text: "Malformed callback." });
    return;
  }

  const username = cb.from.username ?? cb.from.first_name ?? "operator";

  if (action === "accept") {
    await answerCallbackQuery({ callback_query_id: cb.id, text: "Promoting…" });
    const draft = await prisma.policyDraft.findUnique({
      where: { id: draftId },
      include: {
        cluster: { include: { events: { orderBy: { executedAt: "desc" }, take: 5 } } },
      },
    });
    if (!draft || draft.status !== "pending") {
      await editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: `Draft already <b>${draft?.status ?? "missing"}</b>.`,
      });
      return;
    }
    const updated = await prisma.policyDraft.update({
      where: { id: draftId },
      data: { status: "accepted", decidedAt: new Date(), decidedBy: username },
    });
    const promotion = await promoteDraftToLive(updated);
    const ratifiedRow = await prisma.ratifiedPolicy.create({
      data: {
        orgId: updated.orgId,
        draftId: updated.id,
        ruleAction: updated.ruleAction,
        ruleTool: updated.ruleTool,
        ruleDataClass: updated.ruleDataClass,
        ruleParams: (updated.ruleParams ?? {}) as object,
        ruleId: updated.ruleId,
        plainEnglish: updated.plainEnglish,
        ratifiedBy: username,
        active: promotion.ok,
        promotionMode: promotion.mode,
        armorPlanId: promotion.planId ?? null,
        armorIntentRef: promotion.intentReference ?? null,
        armorPlanHash: promotion.planHash ?? null,
        armorMerkleRoot: promotion.merkleRoot ?? null,
      },
    });
    const card: DigestCardSummary = {
      id: updated.id,
      status: "accepted",
      plainEnglish: updated.plainEnglish,
      ruleId: updated.ruleId,
      ruleAction: updated.ruleAction,
      ruleTool: updated.ruleTool,
      ruleDataClass: updated.ruleDataClass,
      ruleParams: (updated.ruleParams as Record<string, unknown>) ?? null,
      reasoning: updated.reasoning,
      dryRunMatched: updated.dryRunMatched,
      dryRunFalsePos: updated.dryRunFalsePos,
      basedOnEventIds: updated.basedOnEventIds,
      cluster: {
        id: draft.cluster.id,
        tool: draft.cluster.tool,
        count: draft.cluster.count,
        firstSeenAt: draft.cluster.firstSeenAt.toISOString(),
        lastSeenAt: draft.cluster.lastSeenAt.toISOString(),
        sampleEvents: draft.cluster.events.map((e) => ({
          id: e.id,
          runId: e.runId,
          action: e.action,
          status: e.status,
          input: e.input,
          executedAt: e.executedAt.toISOString(),
        })),
      },
      createdAt: updated.createdAt.toISOString(),
    };
    await editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text: formatAcceptedMessage(card, {
        id: ratifiedRow.id,
        ruleId: ratifiedRow.ruleId,
        ruleAction: ratifiedRow.ruleAction,
        ruleTool: ratifiedRow.ruleTool,
        ruleDataClass: ratifiedRow.ruleDataClass,
        ruleParams: (ratifiedRow.ruleParams as Record<string, unknown>) ?? null,
        plainEnglish: ratifiedRow.plainEnglish,
        ratifiedAt: ratifiedRow.ratifiedAt.toISOString(),
        ratifiedBy: ratifiedRow.ratifiedBy,
        overrideCount: ratifiedRow.overrideCount,
        active: ratifiedRow.active,
        version: ratifiedRow.version,
      }, username),
      reply_markup: { inline_keyboard: [] },
    });
    return;
  }

  if (action === "dismiss") {
    await answerCallbackQuery({ callback_query_id: cb.id, text: "Dismissed" });
    const draft = await prisma.policyDraft.findUnique({
      where: { id: draftId },
      include: { cluster: { include: { events: { take: 1 } } } },
    });
    if (!draft || draft.status !== "pending") {
      await editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: `Draft already <b>${draft?.status ?? "missing"}</b>.`,
      });
      return;
    }
    await prisma.policyDraft.update({
      where: { id: draftId },
      data: { status: "dismissed", decidedAt: new Date(), decidedBy: username },
    });
    const card: DigestCardSummary = {
      id: draft.id,
      status: "dismissed",
      plainEnglish: draft.plainEnglish,
      ruleId: draft.ruleId,
      ruleAction: draft.ruleAction,
      ruleTool: draft.ruleTool,
      ruleDataClass: draft.ruleDataClass,
      ruleParams: (draft.ruleParams as Record<string, unknown>) ?? null,
      reasoning: draft.reasoning,
      dryRunMatched: draft.dryRunMatched,
      dryRunFalsePos: draft.dryRunFalsePos,
      basedOnEventIds: draft.basedOnEventIds,
      cluster: {
        id: draft.cluster.id,
        tool: draft.cluster.tool,
        count: draft.cluster.count,
        firstSeenAt: draft.cluster.firstSeenAt.toISOString(),
        lastSeenAt: draft.cluster.lastSeenAt.toISOString(),
        sampleEvents: draft.cluster.events.map((e) => ({
          id: e.id,
          runId: e.runId,
          action: e.action,
          status: e.status,
          input: e.input,
          executedAt: e.executedAt.toISOString(),
        })),
      },
      createdAt: draft.createdAt.toISOString(),
    };
    await editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text: formatDismissedMessage(card),
      reply_markup: { inline_keyboard: [] },
    });
    return;
  }

  await answerCallbackQuery({ callback_query_id: cb.id, text: "Unknown action" });
}

async function registerSubscriber(msg: TelegramMessage): Promise<void> {
  const chatId = String(msg.chat.id);
  await prisma.telegramSubscriber.upsert({
    where: { orgId_chatId: { orgId: ORG, chatId } },
    update: {
      username: msg.from?.username ?? null,
      firstName: msg.from?.first_name ?? null,
      active: true,
    },
    create: {
      orgId: ORG,
      chatId,
      username: msg.from?.username ?? null,
      firstName: msg.from?.first_name ?? null,
    },
  });
}

export async function sendDigestTo(chatId: string): Promise<number> {
  const drafts = await listPendingDigest(ORG);
  if (drafts.length === 0) {
    await sendMessage({ chat_id: chatId, text: formatNoDrafts() });
    return 0;
  }
  let sent = 0;
  for (const d of drafts) {
    const card = formatDraftCard(d);
    const message = await sendMessage({
      chat_id: chatId,
      text: card.text,
      reply_markup: card.reply_markup,
    });
    await prisma.telegramDraftMessage.create({
      data: { draftId: d.id, chatId, messageId: message.message_id },
    });
    sent++;
  }
  return sent;
}

export async function pushDraftsToAllSubscribers(draftIds: string[]): Promise<{ chats: number; messages: number }> {
  if (!draftIds.length) return { chats: 0, messages: 0 };
  const subs = await prisma.telegramSubscriber.findMany({ where: { orgId: ORG, active: true } });
  if (!subs.length) return { chats: 0, messages: 0 };

  const drafts = await listPendingDigest(ORG);
  const wanted = drafts.filter((d) => draftIds.includes(d.id));
  let messages = 0;
  for (const sub of subs) {
    for (const d of wanted) {
      try {
        const card = formatDraftCard(d);
        const m = await sendMessage({
          chat_id: sub.chatId,
          text: card.text,
          reply_markup: card.reply_markup,
        });
        await prisma.telegramDraftMessage.create({
          data: { draftId: d.id, chatId: sub.chatId, messageId: m.message_id },
        });
        messages++;
      } catch (err) {
        console.warn(`[telegram] push failed for chat ${sub.chatId}:`, err);
      }
    }
  }
  return { chats: subs.length, messages };
}

async function runSimulate(tool: string): Promise<number> {
  const now = Date.now();
  for (let i = 0; i < 3; i++) {
    await ingestEvent({
      tool,
      action: "policy_deny",
      status: "failed",
      input: {
        vendor: `tg-vendor-${i}`,
        amount: 600 + i * 100,
        currency: "USD",
        memo: "consulting",
      },
      errorMessage: "operator tapped Deny",
      runId: `tg-sim-${now}-${i}`,
      executedAt: new Date(now - (3 - i) * 60_000).toISOString(),
    });
  }
  const result = await runDrafterBatch(ORG);
  return result.created.length;
}
