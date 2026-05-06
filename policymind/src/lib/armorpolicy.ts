// ArmorPolicy integration. We use the same /iap/sdk/token endpoint the
// armorpolicy plugin uses (via @armoriq/sdk) to issue a cryptographically
// signed intent token for every ratified PolicyMind draft. That token is
// our proof of promotion — it is signed by ArmorPolicy's IAP, stored on the
// ratified row, and visible in the dashboard.
//
// Auth contract (verified against @armoriq/sdk and live API):
//   - Header:  X-API-Key: <key>
//   - Body:    { user_id, agent_id, context_id, plan, policy?, expires_in }
//   - Returns: { success, token, plan_id, plan_hash, intent_reference,
//                merkle_root, jwt_token, ... }
// If the API base / key is missing or the call fails we fall back to demo
// mode so ratification still completes locally.

import type { PolicyDraft } from "@prisma/client";

const API_BASE = (process.env.ARMORPOLICY_API_BASE ?? "").trim().replace(/\/$/, "");
const PROXY_BASE = (process.env.ARMORPOLICY_PROXY_BASE ?? "").trim().replace(/\/$/, "");
const API_KEY = (process.env.ARMORPOLICY_API_KEY ?? "").trim();
const USER_ID = (process.env.ARMORPOLICY_USER_ID ?? "policymind-demo-user").trim();
const AGENT_ID = (process.env.ARMORPOLICY_AGENT_ID ?? "policymind-drafter").trim();
const CONTEXT_ID = (process.env.ARMORPOLICY_CONTEXT_ID ?? "default").trim();

export type PromotionResult = {
  ok: boolean;
  mode: "live" | "demo";
  planId?: string;
  intentReference?: string;
  planHash?: string;
  merkleRoot?: string;
  jwtTokenPreview?: string;
  body?: unknown;
  error?: string;
};

export type ProbeResult = {
  base: string;
  proxy: string;
  hasKey: boolean;
  identity: { user_id: string; agent_id: string; context_id: string };
  proxyHealth: { status: number; ms: number; preview: string } | null;
  tokenIssue: { status: number; ms: number; ok: boolean; preview: string } | null;
};

function isConfigured(): boolean {
  return !!(API_BASE && API_KEY);
}

// Build the "plan" we pass to /iap/sdk/token. ArmorPolicy expects a plan with
// goal + steps; PolicyMind's intent here is a single "policy_update" step.
function buildPolicyUpdatePlan(draft: PolicyDraft) {
  return {
    goal: `Promote PolicyMind draft ${draft.ruleId} to live ArmorPolicy policy`,
    steps: [
      {
        action: "policy_update",
        mcp: "policymind",
        params: {
          rule_id: draft.ruleId,
          rule_action: draft.ruleAction,
          rule_tool: draft.ruleTool,
          rule_data_class: draft.ruleDataClass,
          rule_params: draft.ruleParams ?? {},
          plain_english: draft.plainEnglish,
          source_cluster_id: draft.clusterId,
          source_event_ids: draft.basedOnEventIds,
        },
      },
    ],
    metadata: {
      issuer: "policymind",
      reason: `PolicyMind ratified draft ${draft.ruleId} after ${draft.dryRunMatched} clustered events`,
    },
  };
}

export async function promoteDraftToLive(draft: PolicyDraft): Promise<PromotionResult> {
  if (!isConfigured()) {
    return {
      ok: true,
      mode: "demo",
      body: { note: "ARMORPOLICY_API_BASE / ARMORPOLICY_API_KEY not set; recorded locally" },
    };
  }

  const payload = {
    user_id: USER_ID,
    agent_id: AGENT_ID,
    context_id: CONTEXT_ID,
    plan: buildPolicyUpdatePlan(draft),
    expires_in: 60,
  };

  try {
    const res = await fetch(`${API_BASE}/iap/sdk/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = {};
    }

    if (!res.ok || data.success === false) {
      const message =
        typeof data.message === "string"
          ? data.message
          : `HTTP ${res.status}: ${text.slice(0, 200)}`;
      // Demo-mode fallback so ratification still completes locally even when
      // the live promotion fails (e.g. wrong identity, expired key, network).
      return {
        ok: true,
        mode: "demo",
        error: message,
        body: data,
      };
    }

    const planId = typeof data.plan_id === "string" ? data.plan_id : undefined;
    const intentReference = typeof data.intent_reference === "string" ? data.intent_reference : undefined;
    const planHash = typeof data.plan_hash === "string" ? data.plan_hash : undefined;
    const merkleRoot = typeof data.merkle_root === "string" ? data.merkle_root : undefined;
    const jwt = typeof data.jwt_token === "string" ? data.jwt_token : undefined;

    return {
      ok: true,
      mode: "live",
      planId,
      intentReference,
      planHash,
      merkleRoot,
      jwtTokenPreview: jwt ? `${jwt.slice(0, 20)}...${jwt.slice(-8)}` : undefined,
      body: data,
    };
  } catch (err) {
    return {
      ok: true,
      mode: "demo",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Sanity-check connectivity. Two probes:
//   1. proxy /health with X-API-Key — validates the key.
//   2. /iap/sdk/token with a no-op plan — proves we can mint intent tokens.
export async function probeArmorPolicy(): Promise<ProbeResult> {
  const result: ProbeResult = {
    base: API_BASE,
    proxy: PROXY_BASE,
    hasKey: !!API_KEY,
    identity: { user_id: USER_ID, agent_id: AGENT_ID, context_id: CONTEXT_ID },
    proxyHealth: null,
    tokenIssue: null,
  };

  // 1. Validate API key against the proxy /health (same call the SDK makes).
  if (PROXY_BASE && API_KEY) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${PROXY_BASE}/health`, {
        headers: { "X-API-Key": API_KEY },
      });
      const text = await r.text();
      result.proxyHealth = { status: r.status, ms: Date.now() - t0, preview: text.slice(0, 200) };
    } catch (err) {
      result.proxyHealth = {
        status: 0,
        ms: Date.now() - t0,
        preview: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 2. Issue a test intent token with a tiny plan (no real promotion).
  if (API_BASE && API_KEY) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${API_BASE}/iap/sdk/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({
          user_id: USER_ID,
          agent_id: AGENT_ID,
          context_id: CONTEXT_ID,
          plan: {
            goal: "PolicyMind probe",
            steps: [{ action: "noop", mcp: "policymind", params: {} }],
          },
          expires_in: 30,
        }),
      });
      const text = await r.text();
      result.tokenIssue = {
        status: r.status,
        ok: r.ok,
        ms: Date.now() - t0,
        preview: text.slice(0, 300),
      };
    } catch (err) {
      result.tokenIssue = {
        status: 0,
        ok: false,
        ms: Date.now() - t0,
        preview: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return result;
}

// Format the draft as the same plain-English shape ArmorPolicy's NL policy
// engine accepts ("Policy new: <verb> <tool> ...").
export function formatPolicyCommand(draft: PolicyDraft): string {
  const verb =
    draft.ruleAction === "deny"
      ? "block"
      : draft.ruleAction === "require_approval"
        ? "require approval for"
        : "allow";
  const dc = draft.ruleDataClass !== "NONE" ? ` for ${draft.ruleDataClass}` : "";
  return `Policy new: ${verb} ${draft.ruleTool}${dc}`;
}
