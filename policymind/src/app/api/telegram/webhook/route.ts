import { NextRequest, NextResponse } from "next/server";
import { handleUpdate } from "@/lib/telegram-bot";
import type { Update } from "@/lib/telegram";

// Telegram webhook endpoint. Use this if you have a public URL (ngrok, prod
// deploy). For local development without a public URL, run the long-polling
// worker instead: `npm run telegram:bot`.
export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as Update;
    await handleUpdate(update);
  } catch (err) {
    console.error("[telegram webhook]", err);
  }
  // Always 200 — Telegram retries on non-2xx and we don't want to flood.
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST Telegram updates here. For local dev use the polling worker (npm run telegram:bot).",
  });
}
