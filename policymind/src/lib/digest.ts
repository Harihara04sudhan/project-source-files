import { prisma } from "./db";
import type { DigestCardSummary, RatifiedSummary } from "./types";

const ORG_ID_DEFAULT = process.env.POLICYMIND_ORG_ID ?? "demo-org";

export async function listPendingDigest(orgId: string = ORG_ID_DEFAULT): Promise<DigestCardSummary[]> {
  const drafts = await prisma.policyDraft.findMany({
    where: { orgId, status: "pending" },
    include: {
      cluster: {
        include: {
          events: { orderBy: { executedAt: "desc" }, take: 5 },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return drafts.map((d) => ({
    id: d.id,
    status: d.status,
    plainEnglish: d.plainEnglish,
    ruleId: d.ruleId,
    ruleAction: d.ruleAction,
    ruleTool: d.ruleTool,
    ruleDataClass: d.ruleDataClass,
    ruleParams: d.ruleParams as Record<string, unknown> | null,
    reasoning: d.reasoning,
    dryRunMatched: d.dryRunMatched,
    dryRunFalsePos: d.dryRunFalsePos,
    basedOnEventIds: d.basedOnEventIds,
    cluster: {
      id: d.cluster.id,
      tool: d.cluster.tool,
      count: d.cluster.count,
      firstSeenAt: d.cluster.firstSeenAt.toISOString(),
      lastSeenAt: d.cluster.lastSeenAt.toISOString(),
      sampleEvents: d.cluster.events.map((e) => ({
        id: e.id,
        runId: e.runId,
        action: e.action,
        status: e.status,
        input: e.input,
        executedAt: e.executedAt.toISOString(),
      })),
    },
    createdAt: d.createdAt.toISOString(),
  }));
}

export async function listRatifiedPolicies(orgId: string = ORG_ID_DEFAULT): Promise<RatifiedSummary[]> {
  const rows = await prisma.ratifiedPolicy.findMany({
    where: { orgId, active: true },
    orderBy: { ratifiedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    ruleId: r.ruleId,
    ruleAction: r.ruleAction,
    ruleTool: r.ruleTool,
    ruleDataClass: r.ruleDataClass,
    ruleParams: r.ruleParams as Record<string, unknown> | null,
    plainEnglish: r.plainEnglish,
    ratifiedAt: r.ratifiedAt.toISOString(),
    ratifiedBy: r.ratifiedBy,
    overrideCount: r.overrideCount,
    active: r.active,
    version: r.version,
    promotionMode: r.promotionMode,
    armorPlanId: r.armorPlanId,
    armorIntentRef: r.armorIntentRef,
    armorPlanHash: r.armorPlanHash,
    armorMerkleRoot: r.armorMerkleRoot,
  }));
}

export async function getDashboardStats(orgId: string = ORG_ID_DEFAULT) {
  const [eventCount, denyCount, draftPending, ratifiedActive, last24hDenies, clusterCount] = await Promise.all([
    prisma.auditEvent.count({ where: { orgId } }),
    prisma.auditEvent.count({ where: { orgId, action: "policy_deny" } }),
    prisma.policyDraft.count({ where: { orgId, status: "pending" } }),
    prisma.ratifiedPolicy.count({ where: { orgId, active: true } }),
    prisma.auditEvent.count({
      where: {
        orgId,
        action: "policy_deny",
        executedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.eventCluster.count({ where: { orgId } }),
  ]);
  return { eventCount, denyCount, draftPending, ratifiedActive, last24hDenies, clusterCount };
}

export async function getRecentEvents(orgId: string = ORG_ID_DEFAULT, limit = 25) {
  const rows = await prisma.auditEvent.findMany({
    where: { orgId },
    orderBy: { executedAt: "desc" },
    take: limit,
  });
  return rows.map((e) => ({
    id: e.id,
    tool: e.tool,
    action: e.action,
    status: e.status,
    dataClass: e.dataClass,
    runId: e.runId,
    input: e.input,
    executedAt: e.executedAt.toISOString(),
  }));
}

export async function getLearningCurve(orgId: string = ORG_ID_DEFAULT) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.auditEvent.findMany({
    where: { orgId, executedAt: { gte: since } },
    select: { executedAt: true, action: true },
    orderBy: { executedAt: "asc" },
  });
  // Bucket per day.
  const buckets = new Map<string, { day: string; denies: number; success: number }>();
  for (const r of rows) {
    const key = r.executedAt.toISOString().slice(0, 10);
    const b = buckets.get(key) ?? { day: key, denies: 0, success: 0 };
    if (r.action === "policy_deny") b.denies += 1;
    else if (r.action === "tool_call") b.success += 1;
    buckets.set(key, b);
  }
  return Array.from(buckets.values()).sort((a, b) => a.day.localeCompare(b.day));
}
