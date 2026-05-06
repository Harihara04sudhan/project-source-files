"use client";

import { useEffect, useState } from "react";
import {
  Send, Sparkles, ShieldCheck, ShieldAlert, ShieldQuestion, Activity, Bot,
  Banknote, Mail, Trash2, MessageSquare, Database, ArrowUpRight, Eraser,
  Check, X,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";

const STORAGE_KEY = "policymind.agent.turns";

type Verdict = {
  decision: "ALLOWED" | "DENIED" | "APPROVAL_NEEDED";
  matchedPolicy?: { ruleId: string; plainEnglish: string };
  reason: string;
  platform?: {
    planId?: string;
    planHash?: string;
    intentReference?: string;
    merkleRoot?: string;
    jwtPreview?: string;
  };
};

type Turn = {
  prompt: string;
  assistantText?: string;
  toolCall?: { name: string; args: Record<string, unknown> };
  verdict?: Verdict | null;
  event?: { id: string; clusterId: string | null; clusterCount: number | null };
  drafter?: { created: string[]; considered: number } | null;
  approval?: {
    decision: "approve" | "reject";
    by: string;
    at: string;
  };
  error?: string;
};

type Preset = {
  prompt: string;
  category: string;
  icon: typeof Banknote;
  hint: string;
};

const PRESETS: Preset[] = [
  {
    category: "Money movement",
    prompt: "Wire $750 to a new vendor called Acme Industries for consulting services",
    icon: Banknote,
    hint: "wire_transfer  payment data",
  },
  {
    category: "External email",
    prompt: "Email the customer list to external+partner@partners.com",
    icon: Mail,
    hint: "send_email  PII attachment",
  },
  {
    category: "Destructive write",
    prompt: "Delete customer record cust-42 from the customers table",
    icon: Trash2,
    hint: "delete_record  irreversible",
  },
  {
    category: "Internal email",
    prompt: "Send Alice a weekly status update email",
    icon: MessageSquare,
    hint: "send_email  no PII",
  },
  {
    category: "Read-only query",
    prompt: "Search the users table for anyone signed up this week",
    icon: Database,
    hint: "search_db  benign",
  },
];

export default function AgentPage() {
  const [prompt, setPrompt] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTurns(JSON.parse(raw) as Turn[]);
    } catch {
      // ignore — corrupted or unavailable storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(turns));
    } catch {
      // ignore
    }
  }, [turns, hydrated]);

  function clearTurns() {
    setTurns([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  async function run(p: string) {
    if (!p.trim() || busy) return;
    setBusy(true);
    setTurns((t) => [...t, { prompt: p }]);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      const data = await res.json();
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = { prompt: p, ...data };
        return copy;
      });
    } catch (err) {
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = { prompt: p, error: err instanceof Error ? err.message : "failed" };
        return copy;
      });
    } finally {
      setBusy(false);
      setPrompt("");
    }
  }

  async function decideApproval(turnIndex: number, decision: "approve" | "reject") {
    const turn = turns[turnIndex];
    if (!turn?.toolCall || !turn.verdict) return;
    try {
      const res = await fetch("/api/agent/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          eventId: turn.event?.id,
          matchedRuleId: turn.verdict.matchedPolicy?.ruleId,
          tool: turn.toolCall.name,
          args: turn.toolCall.args,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "approval failed");
      setTurns((t) => {
        const copy = [...t];
        copy[turnIndex] = {
          ...copy[turnIndex],
          approval: {
            decision,
            by: "operator@demo",
            at: new Date().toISOString(),
          },
        };
        return copy;
      });
    } catch (err) {
      console.error("[approval]", err);
    }
  }

  return (
    <>
      <TopBar />
      <div className="mx-auto max-w-[1100px] px-6 py-10">
      <div className="mb-6 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-[color:var(--accent)]">
        <Bot className="size-3.5" />
        Agent console
      </div>
      <h1 className="font-display mb-5 text-[44px] leading-[1.05] tracking-tight md:text-[56px]">
        Type a request.
        <br />
        Watch the loop <span className="font-display-italic text-[color:var(--gold)]">close.</span>
      </h1>
      <p className="mb-10 max-w-2xl text-[15px] leading-[1.65] text-[color:var(--text-muted)]">
        gpt-5.5 picks one tool to fulfill your request. ArmorPolicy checks it against your live
        policies. The audit lands in PolicyMind, which clusters it and, after the threshold,
        drafts the next rule for you to ratify.
      </p>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-[22px] tracking-tight">Try a preset</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
          one click &middot; real LLM &middot; real audit
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PRESETS.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.prompt}
              disabled={busy}
              onClick={() => run(p.prompt)}
              className="group relative cursor-pointer overflow-hidden rounded-xl border border-[color:var(--line)] bg-gradient-to-br from-[color:var(--bg-1)] to-[color:var(--bg-2)] p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--accent)]/40 hover:shadow-[0_8px_24px_-12px_rgba(94,234,212,0.25)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex size-9 items-center justify-center rounded-lg border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] text-[color:var(--accent)] transition-colors group-hover:bg-[color:var(--accent-soft)]">
                  <Icon className="size-4" strokeWidth={1.6} />
                </span>
                <ArrowUpRight className="size-3.5 -translate-y-0.5 text-[color:var(--text-dim)] opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:translate-y-0 group-hover:opacity-100" />
              </div>
              <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
                {p.category}
              </div>
              <div className="mt-1.5 text-[14.5px] leading-snug text-[color:var(--text)]">
                {p.prompt}
              </div>
              <div className="mt-3 font-mono text-[11px] text-[color:var(--text-muted)]">
                {p.hint}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        <div className="relative flex items-center gap-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-1)] px-2 py-2 transition-colors focus-within:bg-[color:var(--bg-2)]">
          <span className="pl-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
            you
          </span>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run(prompt);
            }}
            placeholder="Tell the agent what to do…"
            disabled={busy}
            className="flex-1 bg-transparent px-2 py-2 text-[15px] text-[color:var(--text)] placeholder:text-[color:var(--text-dim)]"
          />
          <button
            onClick={() => run(prompt)}
            disabled={busy || !prompt.trim()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--text)] transition-colors hover:border-[color:var(--accent)]/40 hover:bg-[color:var(--bg-3)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {busy ? <Sparkles className="size-3.5 animate-pulse" /> : <Send className="size-3.5 text-[color:var(--accent)]" />}
            {busy ? "Running" : "Run"}
          </button>
        </div>
      </div>

      <div className="mt-8">
        {turns.length > 0 && (
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-[20px] tracking-tight">
              Conversation <span className="font-mono text-xs text-[color:var(--text-dim)]">({turns.length})</span>
            </h2>
            <button
              onClick={clearTurns}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[color:var(--line)] px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--line-strong)] hover:text-[color:var(--text)]"
            >
              <Eraser className="size-3" />
              Clear
            </button>
          </div>
        )}
        <div className="space-y-4">
          {turns.length === 0 && (
            <div className="rounded-md border border-dashed border-[color:var(--line)] bg-[color:var(--bg-1)]/40 p-8 text-center font-mono text-xs text-[color:var(--text-muted)]">
              No runs yet. Click a preset above or type a request.
            </div>
          )}
          {turns.map((t, i) => (
            <TurnCard
              key={i}
              turn={t}
              onDecide={(decision) => decideApproval(i, decision)}
            />
          ))}
        </div>
      </div>
      </div>
    </>
  );
}

function TurnCard({
  turn,
  onDecide,
}: {
  turn: Turn;
  onDecide: (decision: "approve" | "reject") => void;
}) {
  const v = turn.verdict;
  return (
    <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--bg-1)]/60 p-5">
      <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
        <Activity className="size-3" /> User prompt
      </div>
      <div className="mb-4 text-sm text-[color:var(--text)]">{turn.prompt}</div>

      {turn.error && (
        <div className="rounded-md border border-[color:var(--danger)]/40 bg-[color:var(--danger-soft)] px-3 py-2 font-mono text-xs text-[color:var(--danger)]">
          {turn.error}
        </div>
      )}

      {turn.toolCall && (
        <>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
            <Bot className="size-3" /> gpt-5.5 picked tool
          </div>
          <div className="mb-4 rounded-md border border-[color:var(--line)] bg-[color:var(--bg-0)] p-3 font-mono text-xs text-[color:var(--text)]">
            <span className="text-[color:var(--accent)]">{turn.toolCall.name}</span>
            <span className="text-[color:var(--text-muted)]">(</span>
            <pre className="ml-2 mt-1 overflow-auto whitespace-pre-wrap text-[color:var(--text-muted)]">
              {JSON.stringify(turn.toolCall.args, null, 2)}
            </pre>
            <span className="text-[color:var(--text-muted)]">)</span>
          </div>
        </>
      )}

      {v && (
        <>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
            ArmorPolicy verdict
          </div>
          <div
            className={`mb-3 flex items-start gap-2 rounded-md border p-3 ${
              v.decision === "ALLOWED"
                ? "border-[color:var(--success)]/30 bg-[color:var(--success-soft)] text-[color:var(--success)]"
                : v.decision === "DENIED"
                  ? "border-[color:var(--danger)]/30 bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                  : "border-[color:var(--warn)]/30 bg-[color:var(--warn-soft)] text-[color:var(--warn)]"
            }`}
          >
            {v.decision === "ALLOWED" ? (
              <ShieldCheck className="size-4" />
            ) : v.decision === "DENIED" ? (
              <ShieldAlert className="size-4" />
            ) : (
              <ShieldQuestion className="size-4" />
            )}
            <div className="flex-1 font-mono text-xs">
              <div className="mb-1 font-semibold">{v.decision}</div>
              <div className="text-[color:var(--text-muted)]">{v.reason}</div>
            </div>
          </div>

          {v.decision === "APPROVAL_NEEDED" && !turn.approval && (
            <div className="mb-4 rounded-md border border-[color:var(--warn)]/30 bg-[color:var(--warn-soft)] p-3">
              <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[color:var(--warn)]">
                Operator decision
              </div>
              <div className="mb-3 text-[12.5px] leading-snug text-[color:var(--text-muted)]">
                Approving lets this call proceed and bumps the policy&apos;s
                override count (PolicyMind will surface it for relax once the
                threshold is hit). Rejecting strengthens the rule by adding
                another deny event.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onDecide("approve")}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[color:var(--success)]/40 bg-[color:var(--success-soft)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--success)] hover:opacity-90"
                >
                  <Check className="size-3" />
                  Approve
                </button>
                <button
                  onClick={() => onDecide("reject")}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[color:var(--danger)]/40 bg-[color:var(--danger-soft)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--danger)] hover:opacity-90"
                >
                  <X className="size-3" />
                  Reject
                </button>
              </div>
            </div>
          )}

          {turn.approval && (
            <div
              className={`mb-4 rounded-md border p-3 font-mono text-[11px] ${
                turn.approval.decision === "approve"
                  ? "border-[color:var(--success)]/30 bg-[color:var(--success-soft)] text-[color:var(--success)]"
                  : "border-[color:var(--danger)]/30 bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
              }`}
            >
              {turn.approval.decision === "approve" ? (
                <Check className="mr-1.5 inline size-3" />
              ) : (
                <X className="mr-1.5 inline size-3" />
              )}
              {turn.approval.decision === "approve"
                ? "APPROVED by operator — call proceeded; policy override recorded"
                : "REJECTED by operator — policy strengthened with another deny"}
            </div>
          )}
          {v.platform && v.platform.planId && (
            <div className="mb-4 grid gap-1.5 rounded-md border border-[color:var(--line)] bg-[color:var(--bg-0)] p-3 font-mono text-[10.5px]">
              <div className="mb-1 flex items-center gap-2 uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
                <ShieldCheck className="size-3 text-[color:var(--accent)]" /> ArmorPolicy IAP proof
              </div>
              <div>
                <span className="text-[color:var(--text-dim)]">plan_id:</span>{" "}
                <span className="text-[color:var(--text)]">{v.platform.planId}</span>
              </div>
              {v.platform.planHash && (
                <div>
                  <span className="text-[color:var(--text-dim)]">plan_hash:</span>{" "}
                  <span className="text-[color:var(--text-muted)]">
                    {v.platform.planHash.slice(0, 32)}…
                  </span>
                </div>
              )}
              {v.platform.merkleRoot && (
                <div>
                  <span className="text-[color:var(--text-dim)]">merkle_root:</span>{" "}
                  <span className="text-[color:var(--text-muted)]">
                    {v.platform.merkleRoot.slice(0, 32)}…
                  </span>
                </div>
              )}
              {v.platform.jwtPreview && (
                <div>
                  <span className="text-[color:var(--text-dim)]">jwt:</span>{" "}
                  <span className="text-[color:var(--text-muted)]">{v.platform.jwtPreview}</span>
                </div>
              )}
              <div className="mt-1 text-[color:var(--text-dim)]">
                See it at{" "}
                <a
                  href="https://platform.armoriq.ai/dashboard/intent-plans/all-plans"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-[color:var(--accent)]"
                >
                  platform.armoriq.ai
                </a>
              </div>
            </div>
          )}
        </>
      )}

      {turn.event && (
        <div className="mb-2 flex items-center justify-between rounded-md border border-[color:var(--line)] bg-[color:var(--bg-0)] px-3 py-2 font-mono text-[11px]">
          <span className="text-[color:var(--text-muted)]">
            → ingested as event{" "}
            <span className="text-[color:var(--accent)]">{turn.event.id.slice(0, 10)}…</span>
            {turn.event.clusterId && (
              <>
                {" · cluster "}
                <span className="text-[color:var(--text)]">
                  {turn.event.clusterId.slice(0, 10)}…
                </span>
                {" · count "}
                <span className="text-[color:var(--text)]">{turn.event.clusterCount}</span>
              </>
            )}
          </span>
        </div>
      )}

      {turn.drafter && turn.drafter.created.length > 0 && (
        <div className="rounded-md border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/5 px-3 py-2 font-mono text-[11px] text-[color:var(--accent)]">
          ✦ drafter fired — created {turn.drafter.created.length} new draft. Open{" "}
          <a className="underline" href="/digest">
            /digest
          </a>{" "}
          to ratify.
        </div>
      )}
    </div>
  );
}
