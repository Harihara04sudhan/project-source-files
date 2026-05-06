import { NextRequest, NextResponse } from "next/server";
import { ingestEvent } from "@/lib/miner";
import { z } from "zod";

const eventSchema = z.object({
  orgId: z.string().optional(),
  runId: z.string().optional(),
  planId: z.string().optional(),
  userId: z.string().optional(),
  agentId: z.string().optional(),
  tool: z.string().min(1),
  action: z.enum(["tool_call", "policy_deny", "rollback", "override"]),
  status: z.enum(["success", "failed"]),
  dataClass: z.enum(["PCI", "PAYMENT", "PHI", "PII", "NONE"]).optional(),
  input: z.record(z.string(), z.any()),
  output: z.any().optional(),
  errorMessage: z.string().optional(),
  durationMs: z.number().optional(),
  executedAt: z.string().optional(),
});

const batchSchema = z.union([eventSchema, z.array(eventSchema)]);

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = batchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const items = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    const results = [];
    for (const it of items) {
      const { event, cluster } = await ingestEvent(it);
      results.push({ eventId: event.id, clusterId: cluster?.id ?? null, count: cluster?.count ?? null });
    }
    return NextResponse.json({ ok: true, ingested: results.length, results });
  } catch (err) {
    console.error("[ingest] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST a CreateAuditLog-shaped event here" });
}
