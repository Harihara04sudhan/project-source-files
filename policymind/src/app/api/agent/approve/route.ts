import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestEvent } from "@/lib/miner";

// Operator approves (or rejects) a tool call that PolicyMind flagged with
// APPROVAL_NEEDED. On approve we ingest a synthetic 'override' event so
// the call shows up in the audit stream as a human-in-the-loop completion,
// and we bump the matched policy's overrideCount which drives the
// auto-relax surface (see findPoliciesNeedingRelax).
//
// On reject we ingest a 'policy_deny' event so the cluster strengthens.

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    decision?: "approve" | "reject";
    eventId?: string;
    matchedRuleId?: string;
    tool?: string;
    args?: Record<string, unknown>;
    approvedBy?: string;
  };

  if (!body.decision || !body.tool) {
    return NextResponse.json(
      { ok: false, error: "decision and tool required" },
      { status: 400 },
    );
  }

  const orgId = process.env.POLICYMIND_ORG_ID ?? "demo-org";
  const approver = body.approvedBy ?? "operator@demo";

  if (body.decision === "approve") {
    // Record the override on the matched policy. This drives the
    // "policy is being overridden too much, suggest relax" loop.
    if (body.matchedRuleId) {
      await prisma.ratifiedPolicy
        .updateMany({
          where: { orgId, ruleId: body.matchedRuleId, active: true },
          data: { overrideCount: { increment: 1 } },
        })
        .catch(() => undefined);
    }

    // Mark the original event as overridden if we have its id, otherwise
    // log a fresh override event tied to the prior input.
    if (body.eventId) {
      await prisma.auditEvent
        .updateMany({
          where: { id: body.eventId, orgId },
          data: { action: "override", status: "success", errorMessage: null },
        })
        .catch(() => undefined);
    }

    const { event } = await ingestEvent({
      tool: body.tool,
      action: "override",
      status: "success",
      input: body.args ?? {},
      runId: `agent-approval-${Date.now()}`,
      executedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      decision: "approve",
      approvedBy: approver,
      eventId: event.id,
    });
  }

  // Reject path — strengthens the policy by adding another deny event.
  const { event } = await ingestEvent({
    tool: body.tool,
    action: "policy_deny",
    status: "failed",
    input: body.args ?? {},
    errorMessage: `Operator rejected approval request${body.matchedRuleId ? ` for ${body.matchedRuleId}` : ""}`,
    runId: `agent-reject-${Date.now()}`,
    executedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    decision: "reject",
    rejectedBy: approver,
    eventId: event.id,
  });
}
