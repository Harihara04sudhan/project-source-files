import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/db";
import type { DataClass, RuleAction } from "@prisma/client";

const MODEL = process.env.POLICYMIND_DRAFTER_MODEL ?? "gpt-5.5";
const ORG_ID = process.env.POLICYMIND_ORG_ID ?? "demo-org";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

const SYSTEM = `You are PolicyMind Advisor, a security-policy advisor for an
ArmorPolicy deployment. You help operators reason about which policies to add,
relax, or sunset based on the org's live policy ledger and recent audit
patterns.

Voice: short, concrete, never preachy. Lead with the recommendation, then a
one-line reason, then the proposed rule shape. Refer to policies by their
ruleId (policy1, policy2, ...) and tools by name (wire_transfer, send_email,
etc).

When the operator describes a workflow, a near-miss, an incident, or asks
"what should I do about X", consider proposing a draft policy via the
propose_policy_draft tool. Only propose ONE draft per turn — multi-rule
proposals overwhelm operators. If you would propose a near-duplicate of an
existing live policy, point that out instead of drafting.

If the operator is exploring or asking for an explanation, respond in plain
text WITHOUT calling the tool. Reserve the tool for moments when a concrete
new rule clearly improves the posture.

When you do propose a draft, your message text should be 2-3 sentences
explaining the proposed rule and what it would catch. The tool call carries
the structured rule.`;

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "propose_policy_draft",
      description:
        "Propose a new ArmorPolicy policy rule. Files a draft into PolicyMind that the operator can ratify with one tap.",
      parameters: {
        type: "object",
        properties: {
          rule_action: { type: "string", enum: ["deny", "require_approval", "allow"] },
          rule_tool: {
            type: "string",
            description:
              "Tool the rule applies to. Use '*' to apply to all tools (use sparingly).",
          },
          rule_data_class: {
            type: "string",
            enum: ["PCI", "PAYMENT", "PHI", "PII", "NONE"],
            description: "Data class scope. NONE means all data classes.",
          },
          plain_english: {
            type: "string",
            description:
              "One sentence in operator's voice. Under 140 chars. e.g. 'Require approval for wire transfers above $5,000.'",
          },
          reasoning: {
            type: "string",
            description: "Two sentences explaining why this rule and what it would have caught.",
          },
        },
        required: ["rule_action", "rule_tool", "rule_data_class", "plain_english", "reasoning"],
      },
    },
  },
];

async function gatherContext() {
  const [policies, clusters, recentDenies, drafts] = await Promise.all([
    prisma.ratifiedPolicy.findMany({
      where: { orgId: ORG_ID, active: true },
      orderBy: { ratifiedAt: "desc" },
      take: 30,
    }),
    prisma.eventCluster.findMany({
      where: { orgId: ORG_ID },
      orderBy: { count: "desc" },
      take: 8,
    }),
    prisma.auditEvent.findMany({
      where: { orgId: ORG_ID, action: "policy_deny" },
      orderBy: { executedAt: "desc" },
      take: 10,
    }),
    prisma.policyDraft.findMany({
      where: { orgId: ORG_ID, status: "pending" },
      take: 5,
    }),
  ]);

  return {
    policiesText: policies.length
      ? policies
          .map(
            (p) =>
              `- ${p.ruleId} [${p.ruleAction}] tool=${p.ruleTool} dataClass=${p.ruleDataClass} :: ${p.plainEnglish}${p.overrideCount > 0 ? ` (overridden ${p.overrideCount}x)` : ""}`,
          )
          .join("\n")
      : "(no live policies yet)",
    clustersText: clusters.length
      ? clusters
          .map(
            (c) =>
              `- ${c.tool} action=${c.action} dataClass=${c.dataClass} count=${c.count} (last seen ${new Date(c.lastSeenAt).toISOString()})`,
          )
          .join("\n")
      : "(no clusters yet)",
    deniesText: recentDenies.length
      ? recentDenies
          .map((e) => `- ${e.tool} :: ${JSON.stringify(e.input).slice(0, 140)}`)
          .join("\n")
      : "(no recent denies)",
    pendingDraftsText: drafts.length
      ? drafts.map((d) => `- ${d.ruleId} :: ${d.plainEnglish}`).join("\n")
      : "(no pending drafts)",
  };
}

function nextRuleId(existingIds: string[]) {
  let max = 0;
  for (const id of existingIds) {
    const m = id.match(/^policy(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `policy${max + 1}`;
}

async function executeProposeDraft(args: {
  rule_action: RuleAction;
  rule_tool: string;
  rule_data_class: DataClass;
  plain_english: string;
  reasoning: string;
}) {
  const [ratifiedIds, draftIds] = await Promise.all([
    prisma.ratifiedPolicy.findMany({ where: { orgId: ORG_ID }, select: { ruleId: true } }),
    prisma.policyDraft.findMany({ where: { orgId: ORG_ID }, select: { ruleId: true } }),
  ]);
  const ruleId = nextRuleId([
    ...ratifiedIds.map((r) => r.ruleId),
    ...draftIds.map((r) => r.ruleId),
  ]);

  // Advisor-proposed drafts aren't grounded in a clustered pattern. The draft
  // schema requires a unique cluster reference, so create a synthetic
  // placeholder cluster scoped to this proposal.
  const placeholder = await prisma.eventCluster.create({
    data: {
      orgId: ORG_ID,
      tool: args.rule_tool,
      action: args.rule_action === "deny" ? "policy_deny" : "tool_call",
      dataClass: args.rule_data_class,
      argShape: {},
      signature: `advisor:${args.rule_tool}:${args.rule_data_class}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      count: 0,
    },
  });

  // Use existing cluster for dry-run match counts if one exists for this tool.
  const groundingCluster = await prisma.eventCluster.findFirst({
    where: { orgId: ORG_ID, tool: args.rule_tool, NOT: { id: placeholder.id } },
    orderBy: { count: "desc" },
  });

  const draft = await prisma.policyDraft.create({
    data: {
      orgId: ORG_ID,
      clusterId: placeholder.id,
      ruleAction: args.rule_action,
      ruleTool: args.rule_tool,
      ruleDataClass: args.rule_data_class,
      ruleParams: {},
      ruleId,
      plainEnglish: args.plain_english,
      reasoning: `[Advisor-proposed] ${args.reasoning}`,
      dryRunMatched: groundingCluster?.count ?? 0,
      dryRunFalsePos: 0,
      basedOnEventIds: [],
    },
  });
  return {
    ruleId,
    draftId: draft.id,
    plainEnglish: draft.plainEnglish,
    ruleAction: draft.ruleAction,
    ruleTool: draft.ruleTool,
    ruleDataClass: draft.ruleDataClass,
  };
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  const body = (await req.json()) as { messages?: ChatMessage[] };
  const history = body.messages ?? [];
  if (!history.length) {
    return NextResponse.json({ ok: false, error: "messages required" }, { status: 400 });
  }

  const ctx = await gatherContext();
  const systemMessage: ChatMessage = {
    role: "system",
    content: `${SYSTEM}

CURRENT ORG STATE (org=${ORG_ID})

Live policies:
${ctx.policiesText}

Top clusters by repeat count:
${ctx.clustersText}

Most recent operator-denied events:
${ctx.deniesText}

Pending drafts (not yet ratified):
${ctx.pendingDraftsText}`,
  };

  const completion = await openai.chat.completions.create({
    model: MODEL,
    tools: TOOLS,
    tool_choice: "auto",
    max_completion_tokens: 900,
    messages: [systemMessage, ...history] as never,
  });

  const choice = completion.choices[0];
  const assistantText = choice?.message?.content ?? "";
  const toolCalls = choice?.message?.tool_calls ?? [];

  const proposals: Array<{
    ruleId: string;
    draftId: string;
    plainEnglish: string;
    ruleAction: string;
    ruleTool: string;
    ruleDataClass: string;
  }> = [];

  for (const tc of toolCalls) {
    if ("function" in tc && tc.function.name === "propose_policy_draft") {
      try {
        const args = JSON.parse(tc.function.arguments || "{}");
        const created = await executeProposeDraft(args);
        proposals.push(created);
      } catch (err) {
        console.warn("[advisor] propose_policy_draft failed:", err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    assistantText,
    proposals,
  });
}
