import { NextRequest, NextResponse } from "next/server";
import { ingestEvent } from "@/lib/miner";
import { runDrafterBatch } from "@/lib/drafter";
import { pushDraftsToAllSubscribers } from "@/lib/telegram-bot";
import { isTelegramConfigured } from "@/lib/telegram";

// One-shot demo endpoint: emits N synthetic deny events for the same pattern
// and immediately runs the drafter. Lets the stage demo go from "tap deny"
// to "draft policy in the digest" in a single network call.
export async function POST(req: NextRequest) {
  let body: { tool?: string; count?: number; vendor?: string; amount?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const tool = body.tool ?? "wire_transfer";
  const count = Math.max(1, Math.min(10, body.count ?? 3));
  const vendor = body.vendor ?? "new-vendor-acme";
  const amount = body.amount ?? 750;

  const ingested: string[] = [];
  for (let i = 0; i < count; i++) {
    const { event } = await ingestEvent({
      tool,
      action: "policy_deny",
      status: "failed",
      input: { vendor: `${vendor}-${i}`, amount: amount + i * 50, currency: "USD" },
      errorMessage: "operator tapped Deny",
      runId: `demo-run-${Date.now()}-${i}`,
      executedAt: new Date(Date.now() - (count - i) * 60_000).toISOString(),
    });
    ingested.push(event.id);
  }

  const drafter = await runDrafterBatch();
  let telegram: { chats: number; messages: number } | null = null;
  if (isTelegramConfigured() && drafter.created.length > 0) {
    try {
      telegram = await pushDraftsToAllSubscribers(drafter.created);
    } catch (err) {
      console.warn("[simulate] telegram push failed", err);
    }
  }
  return NextResponse.json({ ok: true, ingested, drafter, telegram });
}
