import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { ArmorIQClient, PolicyBlockedException } from "@armoriq/sdk";
import { ingestEvent } from "@/lib/miner";
import { runDrafterBatch } from "@/lib/drafter";
import { detectDataClass } from "@/lib/signature";
import { prisma } from "@/lib/db";
import type { EventAction } from "@prisma/client";

const MODEL = process.env.POLICYMIND_DRAFTER_MODEL ?? "gpt-5.5";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let armorClient: ArmorIQClient | null = null;
function getArmorClient(): ArmorIQClient | null {
  if (armorClient) return armorClient;
  if (!process.env.ARMORPOLICY_API_KEY) return null;
  try {
    armorClient = new ArmorIQClient({
      apiKey: process.env.ARMORPOLICY_API_KEY,
      userId: process.env.ARMORPOLICY_USER_ID ?? "policymind-demo-user",
      agentId: process.env.ARMORPOLICY_AGENT_ID ?? "policymind-agent",
      contextId: process.env.ARMORPOLICY_CONTEXT_ID ?? "default",
    });
    return armorClient;
  } catch (err) {
    console.warn("[agent] ArmorIQClient init failed:", err);
    return null;
  }
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "wire_transfer",
      description: "Send a wire transfer to a vendor. Money movement.",
      parameters: {
        type: "object",
        properties: {
          vendor: { type: "string" },
          amount: { type: "number" },
          currency: { type: "string", enum: ["USD", "EUR", "GBP"] },
          memo: { type: "string" },
        },
        required: ["vendor", "amount"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_email",
      description: "Send an email. Used for notifications, reports, and external comms.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          attachments: { type: "array", items: { type: "string" } },
        },
        required: ["to", "subject"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_invoice",
      description: "Create a customer invoice in the billing system.",
      parameters: {
        type: "object",
        properties: {
          customer: { type: "string" },
          amount: { type: "number" },
        },
        required: ["customer", "amount"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_record",
      description: "Permanently delete a row from the database.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string" },
          id: { type: "string" },
          reason: { type: "string" },
        },
        required: ["table", "id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_db",
      description: "Read-only query against an internal database.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string" },
          filter: { type: "string" },
        },
        required: ["table"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "post_message",
      description: "Post a message to a Slack-style channel.",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string" },
          text: { type: "string" },
        },
        required: ["channel", "text"],
      },
    },
  },
];

type ToolCall = {
  name: string;
  args: Record<string, unknown>;
};

type Verdict = {
  decision: "ALLOWED" | "DENIED" | "APPROVAL_NEEDED";
  matchedPolicy?: { ruleId: string; plainEnglish: string };
  reason: string;
  // Real ArmorPolicy IAP proof when the SDK was used.
  platform?: {
    planId?: string;
    planHash?: string;
    intentReference?: string;
    merkleRoot?: string;
    jwtPreview?: string;
  };
};

// Build the plan we submit to ArmorPolicy IAP. One agent prompt = one plan
// with exactly one step. The platform makes the policy decision; we just
// surface the verdict back to the UI.
function buildPlanForToolCall(toolCall: ToolCall, prompt: string) {
  return {
    plan: {
      goal: prompt,
      steps: [
        {
          action: toolCall.name,
          mcp: "policymind-agent",
          params: toolCall.args,
        },
      ],
    },
    metadata: {
      issuer: "policymind",
      flow: "agent-console",
    },
  };
}

// Evaluate the verdict against the locally-ratified PolicyMind rules. This
// is the "PolicyMind owns the decision" path — what the closed-loop demo
// shows: ratifying a draft on /digest immediately changes verdicts here.
async function evaluatePolicyLocal(toolCall: ToolCall): Promise<Verdict> {
  const dataClass = detectDataClass(toolCall.args);
  const orgId = process.env.POLICYMIND_ORG_ID ?? "demo-org";
  const policies = await prisma.ratifiedPolicy.findMany({
    where: { orgId, active: true },
  });
  for (const p of policies) {
    if (p.ruleTool !== toolCall.name && p.ruleTool !== "*") continue;
    if (p.ruleDataClass !== "NONE" && p.ruleDataClass !== dataClass) continue;
    if (p.ruleAction === "deny") {
      return {
        decision: "DENIED",
        matchedPolicy: { ruleId: p.ruleId, plainEnglish: p.plainEnglish },
        reason: `Blocked by ${p.ruleId}: ${p.plainEnglish}`,
      };
    }
    if (p.ruleAction === "require_approval") {
      return {
        decision: "APPROVAL_NEEDED",
        matchedPolicy: { ruleId: p.ruleId, plainEnglish: p.plainEnglish },
        reason: `${p.ruleId} requires human approval: ${p.plainEnglish}`,
      };
    }
  }
  return {
    decision: "ALLOWED",
    reason: "No matching PolicyMind rule. Call passes through.",
  };
}

// Submit the plan to ArmorPolicy IAP for cryptographic audit/proof. Returns
// the platform fields (plan_id, merkle_root, jwt) on success, or null if
// the SDK isn't configured / the call failed. We never block on this — the
// verdict comes from evaluatePolicyLocal. The platform is the audit ledger.
async function submitPlanForProof(
  toolCall: ToolCall,
  prompt: string,
): Promise<NonNullable<Verdict["platform"]> | null> {
  const client = getArmorClient();
  if (!client) return null;
  try {
    const token = await client.getIntentToken(buildPlanForToolCall(toolCall, prompt), undefined, 60);
    const jwt = token.jwtToken ?? "";
    return {
      planId: token.planId,
      planHash: token.planHash,
      intentReference: token.tokenId,
      merkleRoot: token.rawToken?.merkle_root,
      jwtPreview: jwt ? `${jwt.slice(0, 20)}...${jwt.slice(-8)}` : undefined,
    };
  } catch (err) {
    // Platform may deny submission entirely (e.g. default-deny org). That's
    // fine — local verdict still determines the demo outcome. Log and move
    // on. We surface a minimal proof shape so the UI can show that the
    // platform was contacted.
    if (err instanceof PolicyBlockedException) {
      console.warn(
        "[agent] platform PolicyBlocked on plan submission (using local verdict):",
        err.reason ?? err.message,
      );
      return null;
    }
    console.warn(
      "[agent] platform proof submission failed (using local verdict):",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { prompt?: string };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ ok: false, error: "prompt required" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY not set" },
      { status: 500 },
    );
  }

  const completion = await openai.chat.completions.create({
    model: MODEL,
    tools: TOOLS,
    tool_choice: "auto",
    max_completion_tokens: 800,
    messages: [
      {
        role: "system",
        content:
          "You are an autonomous back-office agent with access to operational tools. Read the user request and call exactly ONE tool to fulfill it. Pick concrete realistic values for the parameters; don't ask the user for clarification.",
      },
      { role: "user", content: prompt },
    ],
  });

  const choice = completion.choices[0];
  const toolCalls = choice?.message?.tool_calls ?? [];
  const assistantText = choice?.message?.content ?? "";

  if (toolCalls.length === 0) {
    return NextResponse.json({
      ok: true,
      mode: "no_tool",
      assistantText,
      verdict: null,
      eventId: null,
    });
  }

  const tc = toolCalls[0];
  const fn = "function" in tc ? tc.function : null;
  if (!fn) {
    return NextResponse.json({ ok: false, error: "tool call missing function" }, { status: 500 });
  }

  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = JSON.parse(fn.arguments || "{}");
  } catch {
    parsedArgs = {};
  }
  const toolCall: ToolCall = { name: fn.name, args: parsedArgs };

  // Run platform proof submission and local verdict in parallel. Local
  // verdict drives the UI; platform fields attach as cryptographic proof.
  const [proof, verdict] = await Promise.all([
    submitPlanForProof(toolCall, prompt),
    evaluatePolicyLocal(toolCall),
  ]);
  if (proof) verdict.platform = proof;

  const action: EventAction =
    verdict.decision === "DENIED"
      ? "policy_deny"
      : verdict.decision === "APPROVAL_NEEDED"
        ? "policy_deny"
        : "tool_call";
  const status = verdict.decision === "ALLOWED" ? "success" : "failed";

  const { event, cluster } = await ingestEvent({
    tool: toolCall.name,
    action,
    status,
    input: parsedArgs,
    errorMessage:
      verdict.decision === "DENIED"
        ? `ArmorPolicy denied: ${verdict.matchedPolicy?.ruleId ?? "operator policy"}`
        : verdict.decision === "APPROVAL_NEEDED"
          ? `ArmorPolicy requires approval: ${verdict.matchedPolicy?.ruleId ?? "operator policy"}`
          : undefined,
    runId: `agent-${Date.now()}`,
    executedAt: new Date().toISOString(),
  });

  // Every agent event is a chance to drain the eligible queue. The drafter
  // is idempotent (only drafts clusters at threshold without an existing
  // draft), so calling it unconditionally is safe and makes the loop feel
  // alive — primed seeded clusters get drafted on the first interaction
  // even if THIS event's cluster is fresh.
  let drafter: { created: string[]; considered: number } | null = null;
  drafter = await runDrafterBatch();

  return NextResponse.json({
    ok: true,
    assistantText,
    toolCall,
    verdict,
    event: {
      id: event.id,
      clusterId: cluster?.id ?? null,
      clusterCount: cluster?.count ?? null,
    },
    drafter,
  });
}
