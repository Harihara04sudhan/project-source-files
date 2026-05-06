import { prisma } from "./db";
import { Prisma, type AuditEvent, type EventCluster } from "@prisma/client";
import { clusterSignature, detectDataClass, shapeArgs } from "./signature";
import type { IngestEvent } from "./types";

const ORG_ID_DEFAULT = process.env.POLICYMIND_ORG_ID ?? "demo-org";

// We only cluster events that should produce a candidate policy. Successful
// tool calls aren't policy-worthy on their own; denials, rollbacks, and
// overrides are.
const CLUSTERABLE_ACTIONS = new Set(["policy_deny", "rollback", "override"]);

export async function ingestEvent(raw: IngestEvent): Promise<{ event: AuditEvent; cluster: EventCluster | null }> {
  const orgId = raw.orgId ?? ORG_ID_DEFAULT;
  const dataClass = raw.dataClass ?? detectDataClass(raw.input);
  const executedAt = raw.executedAt ? new Date(raw.executedAt) : new Date();

  const shape = shapeArgs(raw.input);
  const isClusterable = CLUSTERABLE_ACTIONS.has(raw.action);

  let cluster: EventCluster | null = null;
  if (isClusterable) {
    const signature = clusterSignature({
      tool: raw.tool,
      action: raw.action,
      dataClass,
      argShape: shape,
    });
    cluster = await prisma.eventCluster.upsert({
      where: { orgId_signature: { orgId, signature } },
      update: {
        count: { increment: 1 },
        lastSeenAt: executedAt,
      },
      create: {
        orgId,
        signature,
        tool: raw.tool,
        action: raw.action,
        dataClass,
        argShape: shape as object,
        count: 1,
        firstSeenAt: executedAt,
        lastSeenAt: executedAt,
      },
    });
  }

  const event = await prisma.auditEvent.create({
    data: {
      orgId,
      runId: raw.runId,
      planId: raw.planId,
      userId: raw.userId,
      agentId: raw.agentId,
      tool: raw.tool,
      action: raw.action,
      status: raw.status,
      dataClass,
      input: raw.input as Prisma.InputJsonValue,
      output: raw.output === undefined ? Prisma.JsonNull : (raw.output as Prisma.InputJsonValue),
      errorMessage: raw.errorMessage,
      durationMs: raw.durationMs ?? 0,
      executedAt,
      clusterId: cluster?.id,
    },
  });

  return { event, cluster };
}

// Find clusters that have crossed the draft threshold and don't yet have a
// pending draft. The miner returns these so the drafter can write rules.
export async function findClustersReadyForDrafting(orgId: string = ORG_ID_DEFAULT) {
  const threshold = Number(process.env.POLICYMIND_CLUSTER_THRESHOLD ?? 3);
  // A cluster is ready when count >= threshold AND it has either no draft
  // yet or only a dismissed draft. Pending or ratified means the operator
  // already saw a proposal — don't re-spam. Dismissed means the operator
  // rejected the wording, so try again with fresh reasoning.
  const candidates = await prisma.eventCluster.findMany({
    where: {
      orgId,
      count: { gte: threshold },
      OR: [{ draft: null }, { draft: { status: "dismissed" } }],
    },
    include: {
      events: { orderBy: { executedAt: "desc" }, take: 5 },
    },
    orderBy: { lastSeenAt: "desc" },
  });
  return candidates;
}

// Override-based auto-relax detection: if a ratified policy has been
// overridden enough times, surface it for relaxation.
export async function findPoliciesNeedingRelax(orgId: string = ORG_ID_DEFAULT) {
  const threshold = Number(process.env.POLICYMIND_OVERRIDE_RELAX_THRESHOLD ?? 5);
  return prisma.ratifiedPolicy.findMany({
    where: { orgId, active: true, overrideCount: { gte: threshold } },
  });
}
