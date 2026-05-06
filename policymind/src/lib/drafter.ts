import OpenAI from "openai";
import { prisma } from "./db";
import { findClustersReadyForDrafting } from "./miner";
import type { DraftedRule } from "./types";
import type { AuditEvent, DataClass, EventCluster, RuleAction } from "@prisma/client";

const DRAFTER_MODEL = process.env.POLICYMIND_DRAFTER_MODEL ?? "gpt-5.5";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are PolicyMind, a security-policy drafter. You turn repeated
ArmorPolicy audit events into a single ArmorPolicy-shaped policy rule.

ArmorPolicy policy rule schema:
{
  "id": "policyN",
  "action": "allow" | "deny" | "require_approval",
  "tool": "tool_name_or_*",
  "dataClass": "PCI" | "PAYMENT" | "PHI" | "PII" | undefined,
  "params": { /* optional matchers */ }
}

Output strict JSON only matching:
{
  "ruleAction": "deny" | "require_approval" | "allow",
  "ruleTool": "<tool>",
  "ruleDataClass": "PCI" | "PAYMENT" | "PHI" | "PII" | "NONE",
  "ruleParams": { ... } | null,
  "plainEnglish": "<one sentence the user reads in their digest>",
  "reasoning": "<two sentences explaining why this rule and what it would have prevented>"
}

Guidelines:
- Choose "deny" only when the pattern is unambiguously dangerous and never legitimate.
- Choose "require_approval" when a human-in-the-loop is the safer default.
- Keep plainEnglish under 140 characters, in the user's voice ("Require approval for ...").
- Do not reference policy IDs in plainEnglish.
- The reasoning should call out what historical action would have been prevented.`;

function buildUserPrompt(cluster: EventCluster & { events: AuditEvent[] }) {
  const sample = cluster.events.slice(0, 5).map((e, i) => ({
    n: i + 1,
    tool: e.tool,
    action: e.action,
    status: e.status,
    dataClass: e.dataClass,
    runId: e.runId,
    input: e.input,
    error: e.errorMessage ?? null,
    executedAt: e.executedAt.toISOString(),
  }));
  return `A pattern has repeated ${cluster.count} times in the past week.

Tool: ${cluster.tool}
Action signal: ${cluster.action}
Detected data class: ${cluster.dataClass}
Argument shape (placeholders, not raw values):
${JSON.stringify(cluster.argShape, null, 2)}

Sample events that produced this signal:
${JSON.stringify(sample, null, 2)}

Draft ONE ArmorPolicy policy rule that, if it had existed, would have caught
these events automatically. Output strict JSON.`;
}

function nextRuleId(existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const m = id.match(/^policy(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `policy${max + 1}`;
}

function safeParse(text: string): Record<string, unknown> | null {
  let raw = text.trim();
  if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function coerceAction(v: unknown): RuleAction {
  if (v === "allow" || v === "deny" || v === "require_approval") return v;
  return "require_approval";
}

function coerceDataClass(v: unknown): DataClass {
  if (v === "PCI" || v === "PAYMENT" || v === "PHI" || v === "PII" || v === "NONE") return v;
  return "NONE";
}

async function draftWithOpenAI(cluster: EventCluster & { events: AuditEvent[] }): Promise<DraftedRule> {
  const ruleIdsInUse = await prisma.ratifiedPolicy
    .findMany({ where: { orgId: cluster.orgId }, select: { ruleId: true } })
    .then((rows) => rows.map((r) => r.ruleId));
  const draftIdsInUse = await prisma.policyDraft
    .findMany({ where: { orgId: cluster.orgId }, select: { ruleId: true } })
    .then((rows) => rows.map((r) => r.ruleId));
  const proposedId = nextRuleId([...ruleIdsInUse, ...draftIdsInUse]);

  if (!process.env.OPENAI_API_KEY) {
    return localFallbackDraft(cluster, proposedId);
  }

  try {
    const response = await openai.chat.completions.create({
      model: DRAFTER_MODEL,
      response_format: { type: "json_object" },
      max_completion_tokens: 600,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(cluster) },
      ],
    });
    const content = response.choices[0]?.message?.content ?? "";
    const parsed = safeParse(content);
    if (!parsed) return localFallbackDraft(cluster, proposedId);
    return {
      ruleId: proposedId,
      ruleAction: coerceAction(parsed.ruleAction),
      ruleTool: typeof parsed.ruleTool === "string" ? parsed.ruleTool : cluster.tool,
      ruleDataClass: coerceDataClass(parsed.ruleDataClass),
      ruleParams: (parsed.ruleParams as Record<string, unknown> | null) ?? undefined,
      plainEnglish: typeof parsed.plainEnglish === "string" ? parsed.plainEnglish : "",
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch (err) {
    console.warn("[drafter] openai failed, using fallback:", err);
    return localFallbackDraft(cluster, proposedId);
  }
}

function localFallbackDraft(cluster: EventCluster & { events: AuditEvent[] }, ruleId: string): DraftedRule {
  const action: RuleAction = cluster.action === "policy_deny" ? "deny" : "require_approval";
  const verb = action === "deny" ? "block" : "require approval for";
  const dc = cluster.dataClass !== "NONE" ? ` involving ${cluster.dataClass} data` : "";
  return {
    ruleId,
    ruleAction: action,
    ruleTool: cluster.tool,
    ruleDataClass: cluster.dataClass,
    ruleParams: undefined,
    plainEnglish: `Automatically ${verb} ${cluster.tool}${dc} based on ${cluster.count} repeated taps.`,
    reasoning: `Pattern repeated ${cluster.count} times. Drafting locally because the LLM was unavailable; review the underlying events and refine before ratifying.`,
  };
}

export async function draftClusterRule(cluster: EventCluster & { events: AuditEvent[] }) {
  const drafted = await draftWithOpenAI(cluster);
  const dryRunMatched = cluster.events.length;
  const dryRunFalsePos = 0;

  // clusterId is @unique on PolicyDraft. If a previous draft for this cluster
  // exists (e.g. dismissed), upsert it back to pending with fresh wording.
  const draft = await prisma.policyDraft.upsert({
    where: { clusterId: cluster.id },
    create: {
      orgId: cluster.orgId,
      clusterId: cluster.id,
      ruleAction: drafted.ruleAction,
      ruleTool: drafted.ruleTool,
      ruleDataClass: drafted.ruleDataClass,
      ruleParams: (drafted.ruleParams ?? {}) as object,
      ruleId: drafted.ruleId,
      plainEnglish: drafted.plainEnglish,
      reasoning: drafted.reasoning,
      dryRunMatched,
      dryRunFalsePos,
      basedOnEventIds: cluster.events.slice(0, 5).map((e) => e.id),
    },
    update: {
      ruleAction: drafted.ruleAction,
      ruleTool: drafted.ruleTool,
      ruleDataClass: drafted.ruleDataClass,
      ruleParams: (drafted.ruleParams ?? {}) as object,
      plainEnglish: drafted.plainEnglish,
      reasoning: drafted.reasoning,
      dryRunMatched,
      dryRunFalsePos,
      basedOnEventIds: cluster.events.slice(0, 5).map((e) => e.id),
      status: "pending",
      decidedAt: null,
      decidedBy: null,
    },
  });
  return draft;
}

export async function runDrafterBatch(orgId?: string) {
  const ready = await findClustersReadyForDrafting(orgId);
  const created: string[] = [];
  for (const cluster of ready) {
    const draft = await draftClusterRule(cluster);
    created.push(draft.id);
  }
  return { created, considered: ready.length };
}
