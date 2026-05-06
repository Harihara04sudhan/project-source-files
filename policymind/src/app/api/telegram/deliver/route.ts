import { NextRequest, NextResponse } from "next/server";
import { sendDigestTo, pushDraftsToAllSubscribers } from "@/lib/telegram-bot";
import { prisma } from "@/lib/db";

// Manually push pending digest cards to a chat or to all subscribers.
// POST {chatId} — push to one chat
// POST {} — push pending drafts to all subscribed chats
export async function POST(req: NextRequest) {
  let body: { chatId?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.chatId) {
    const sent = await sendDigestTo(body.chatId);
    return NextResponse.json({ ok: true, mode: "single", chatId: body.chatId, sent });
  }

  // For "push everything pending to everyone" we need draft IDs.
  const orgId = process.env.POLICYMIND_ORG_ID ?? "demo-org";
  const pending = await prisma.policyDraft.findMany({
    where: { orgId, status: "pending" },
    select: { id: true },
  });
  const result = await pushDraftsToAllSubscribers(pending.map((p) => p.id));
  return NextResponse.json({ ok: true, mode: "broadcast", drafts: pending.length, ...result });
}
