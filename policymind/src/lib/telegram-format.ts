// Renders draft cards and confirmation messages for Telegram.
// Uses HTML parse_mode (more forgiving than Markdown for LLM-produced text).

import type { DigestCardSummary, RatifiedSummary } from "./types";
import type { InlineKeyboard } from "./telegram";
import { esc } from "./telegram";

const POLICY_BASE = process.env.POLICYMIND_BASE_URL ?? "http://localhost:3000";

function actionVerb(a: "allow" | "deny" | "require_approval"): string {
  if (a === "allow") return "allow";
  if (a === "deny") return "block";
  return "require approval for";
}

function actionMarker(a: "allow" | "deny" | "require_approval"): string {
  // Status glyphs read as icons in chat; not playful emoji.
  if (a === "deny") return "🛡";
  if (a === "require_approval") return "⏸";
  return "✓";
}

export function formatDraftCard(d: DigestCardSummary): { text: string; reply_markup: InlineKeyboard } {
  const verb = actionVerb(d.ruleAction);
  const dc = d.ruleDataClass !== "NONE" ? ` for ${d.ruleDataClass}` : "";
  const policyLine = `Policy new: ${verb} ${d.ruleTool}${dc}`;
  const sampleRunIds = d.cluster.sampleEvents
    .slice(0, 3)
    .map((e) => esc((e.runId ?? "—").slice(0, 6)))
    .join(", ");

  const text =
    `${actionMarker(d.ruleAction)} <b>POLICYMIND // THIS WEEK'S DRAFT</b>\n\n` +
    `I noticed you ${esc(pastTenseVerbForCluster(d))} <b>${d.cluster.count}</b> ${esc(pluralizeTool(d))} last week. ` +
    `Want me to make that automatic?\n\n` +
    `<b>Drafted rule:</b>\n` +
    `<pre>${esc(policyLine)}</pre>\n` +
    `<b>Plain English:</b>\n` +
    `${esc(d.plainEnglish)}\n\n` +
    `<b>Based on:</b>\n` +
    `${d.cluster.count} events · runIds ${sampleRunIds}\n\n` +
    `<b>Dry-run:</b>\n` +
    `would have paused ${d.dryRunMatched} of ${d.cluster.count} past attempts · ${d.dryRunFalsePos} false positives\n\n` +
    `<i>${esc(d.reasoning)}</i>`;

  // Telegram rejects localhost URLs in inline buttons. Only include the
  // "View in dashboard" deep-link when the base URL is publicly reachable.
  const isPublicUrl = /^https?:\/\//i.test(POLICY_BASE) && !/localhost|127\.|0\.0\.0\.0/i.test(POLICY_BASE);
  const buttonRows: InlineKeyboard["inline_keyboard"] = [
    [
      { text: "✅ Accept policy", callback_data: `accept:${d.id}` },
      { text: "❌ Dismiss", callback_data: `dismiss:${d.id}` },
    ],
  ];
  if (isPublicUrl) {
    buttonRows.push([{ text: "🔍 View in dashboard", url: `${POLICY_BASE}/digest` }]);
  }
  const reply_markup: InlineKeyboard = { inline_keyboard: buttonRows };

  return { text, reply_markup };
}

function pastTenseVerbForCluster(d: DigestCardSummary): string {
  if (d.cluster.sampleEvents.some((e) => e.action === "policy_deny")) return "denied";
  if (d.cluster.sampleEvents.some((e) => e.action === "rollback")) return "rolled back";
  if (d.cluster.sampleEvents.some((e) => e.action === "override")) return "overrode";
  return "flagged";
}

function pluralizeTool(d: DigestCardSummary): string {
  const t = d.cluster.tool.replace(/_/g, " ");
  if (t.endsWith("s")) return `${t}`;
  return `${t}s`;
}

export function formatAcceptedMessage(d: DigestCardSummary, ratified: RatifiedSummary, ratifiedBy?: string): string {
  const proof =
    ratified.promotionMode === "live" && ratified.armorIntentRef
      ? `\n<b>ArmorPolicy proof:</b> <code>${esc(ratified.armorIntentRef)}</code> (signed)\n`
      : `\n<i>Recorded locally (demo mode).</i>\n`;
  return (
    `✅ <b>POLICY RATIFIED</b>\n\n` +
    `<b>${esc(ratified.ruleId)}</b> is now live.\n\n` +
    `<pre>${esc(formatPolicyCommandFromRatified(ratified))}</pre>\n` +
    `<i>${esc(d.plainEnglish)}</i>\n` +
    proof +
    `Ratified by <b>${esc(ratifiedBy ?? "operator")}</b> · view: ${esc(POLICY_BASE)}/ledger`
  );
}

export function formatDismissedMessage(d: DigestCardSummary): string {
  return (
    `❌ <b>DRAFT DISMISSED</b>\n\n` +
    `<i>${esc(d.plainEnglish)}</i>\n\n` +
    `The pattern is still in the audit log; if it keeps repeating, PolicyMind will draft a new rule.`
  );
}

function formatPolicyCommandFromRatified(r: RatifiedSummary): string {
  const verb = actionVerb(r.ruleAction);
  const dc = r.ruleDataClass !== "NONE" ? ` for ${r.ruleDataClass}` : "";
  return `Policy new: ${verb} ${r.ruleTool}${dc}`;
}

export function formatHelp(botUsername: string): string {
  return (
    `<b>PolicyMind</b> — the security policy that writes itself.\n\n` +
    `I watch every approval, denial and rollback in your ArmorPolicy audit trail. When I see a pattern repeat, I draft an ArmorPolicy policy in plain English. You tap once to ratify.\n\n` +
    `<b>Commands:</b>\n` +
    `/start — subscribe this chat to the digest\n` +
    `/digest — show pending drafted policies\n` +
    `/policies — list ratified policies\n` +
    `/simulate — fire a synthetic deny pattern (stage demo)\n` +
    `/help — this message\n\n` +
    `Bot: @${esc(botUsername)}\n` +
    `Dashboard: ${esc(POLICY_BASE)}`
  );
}

export function formatRatifiedList(rows: RatifiedSummary[]): string {
  if (!rows.length) {
    return "<b>No ratified policies yet.</b>\n\nTap /digest to see pending drafts.";
  }
  const head = `<b>Live policies (${rows.length})</b>`;
  const lines = rows.slice(0, 20).map((r) => {
    const verb = actionVerb(r.ruleAction);
    const dc = r.ruleDataClass !== "NONE" ? ` for ${r.ruleDataClass}` : "";
    return `• <code>${esc(r.ruleId)}</code> — ${esc(verb)} ${esc(r.ruleTool)}${esc(dc)}\n  <i>${esc(r.plainEnglish)}</i>`;
  });
  return [head, "", ...lines].join("\n");
}

export function formatNoDrafts(): string {
  return (
    `<b>No drafts pending.</b>\n\n` +
    `The loop is quiet. New denials, rollbacks or overrides will land here as soon as they cluster (3+ similar events). ` +
    `Try /simulate to seed a synthetic pattern.`
  );
}

export function formatSimulateAck(created: number): string {
  return (
    `🧪 <b>Simulated 3 wire-transfer denies.</b>\n\n` +
    `Drafter created ${created} new draft${created === 1 ? "" : "s"}. ` +
    `Use /digest to review.`
  );
}
