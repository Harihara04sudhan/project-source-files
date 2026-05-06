import { NextResponse } from "next/server";
import { runDrafterBatch } from "@/lib/drafter";

// Triggers the drafter manually. In production this is what the cron job hits.
export async function POST() {
  try {
    const result = await runDrafterBatch();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[miner/run] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST to run the drafter over ready clusters" });
}
