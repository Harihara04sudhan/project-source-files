"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send, Sparkles, Eraser, Brain, ShieldPlus, ArrowRight, MessageCircle,
  AlertTriangle, Users, ShieldCheck, RefreshCw,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";

const STORAGE_KEY = "policymind.advisor.thread";

type Proposal = {
  ruleId: string;
  draftId: string;
  plainEnglish: string;
  ruleAction: string;
  ruleTool: string;
  ruleDataClass: string;
};

type Turn =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      proposals: Proposal[];
    };

type Starter = {
  category: string;
  prompt: string;
  icon: typeof Brain;
};

const STARTERS: Starter[] = [
  {
    category: "New workflow",
    prompt:
      "We just hired a finance team that does daily wire transfers between $1k and $10k to known vendors. What policy should we add so they aren't constantly approving each one, but new vendors still get caught?",
    icon: Users,
  },
  {
    category: "Near miss",
    prompt:
      "A junior engineer almost emailed a customer list to an external partner yesterday. ArmorPolicy didn't catch it because the policy is too narrow. What should we tighten?",
    icon: AlertTriangle,
  },
  {
    category: "Relax a rule",
    prompt:
      "Operators keep overriding policy3 (require_approval for delete_record) for routine GDPR deletions. Should we relax it, scope it, or split it?",
    icon: RefreshCw,
  },
  {
    category: "Posture review",
    prompt:
      "Audit our current posture: which patterns are about to need a policy, which live policies are weakest, and what's the single highest-leverage rule to add this week?",
    icon: ShieldCheck,
  },
  {
    category: "Incident",
    prompt:
      "An agent just deleted three production rows because a user said 'clean up old test records'. What policy should have caught this?",
    icon: AlertTriangle,
  },
];

export default function AdvisorPage() {
  const [thread, setThread] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setThread(JSON.parse(raw) as Turn[]);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(thread));
    } catch {}
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread, hydrated]);

  function clearThread() {
    setThread([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  async function send(prompt: string) {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");

    const nextThread: Turn[] = [...thread, { role: "user", content: text }];
    setThread(nextThread);

    try {
      const res = await fetch("/api/advisor/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextThread.map((t) =>
            t.role === "user"
              ? { role: "user", content: t.content }
              : { role: "assistant", content: t.content },
          ),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "advisor failed");
      setThread([
        ...nextThread,
        { role: "assistant", content: data.assistantText, proposals: data.proposals ?? [] },
      ]);
    } catch (err) {
      setThread([
        ...nextThread,
        {
          role: "assistant",
          content: `Advisor failed: ${err instanceof Error ? err.message : "unknown"}`,
          proposals: [],
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <div className="mx-auto max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-[color:var(--accent)]">
          <Brain className="size-3.5" />
          Policy advisor
        </div>
        <h1 className="font-display mb-5 text-[40px] leading-[1.05] tracking-tight md:text-[52px]">
          Talk through your posture.
          <br />
          File the next rule
          <span className="font-display-italic text-[color:var(--gold)]"> in one tap.</span>
        </h1>
        <p className="mb-10 max-w-2xl text-[15px] leading-[1.65] text-[color:var(--text-muted)]">
          The advisor knows your live policies, recent denies, and the patterns
          that are about to need a rule. Describe a workflow, a near-miss, or
          ask what to add — proposed drafts land directly on the digest.
        </p>

        {thread.length === 0 && (
          <>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-[22px] tracking-tight">Start a thread</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
                memory persists across tabs
              </span>
            </div>
            <div className="mb-8 grid gap-3 sm:grid-cols-2">
              {STARTERS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.prompt}
                    disabled={busy}
                    onClick={() => send(s.prompt)}
                    className="group cursor-pointer overflow-hidden rounded-xl border border-[color:var(--line)] bg-gradient-to-br from-[color:var(--bg-1)] to-[color:var(--bg-2)] p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-lg border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] text-[color:var(--accent)]">
                        <Icon className="size-4" strokeWidth={1.6} />
                      </span>
                      <ArrowRight className="size-3.5 text-[color:var(--text-dim)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                    </div>
                    <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
                      {s.category}
                    </div>
                    <div className="mt-1.5 text-[14px] leading-snug text-[color:var(--text)]">
                      {s.prompt}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {thread.length > 0 && (
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-[20px] tracking-tight">
              Thread <span className="font-mono text-xs text-[color:var(--text-dim)]">({thread.length} messages)</span>
            </h2>
            <button
              onClick={clearThread}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[color:var(--line)] px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--line-strong)] hover:text-[color:var(--text)]"
            >
              <Eraser className="size-3" />
              Clear
            </button>
          </div>
        )}

        <div className="space-y-4">
          {thread.map((t, i) =>
            t.role === "user" ? (
              <div
                key={i}
                className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm border border-[color:var(--line)] bg-[color:var(--bg-1)] px-4 py-3 text-[14.5px] leading-relaxed text-[color:var(--text)]"
              >
                {t.content}
              </div>
            ) : (
              <div key={i} className="max-w-[88%] space-y-3">
                <div className="flex items-start gap-3 rounded-2xl rounded-tl-sm border border-[color:var(--line)] bg-gradient-to-br from-[color:var(--bg-1)] to-[color:var(--bg-2)] p-4">
                  <span className="mt-0.5 inline-flex size-7 items-center justify-center rounded-md border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] text-[color:var(--accent)]">
                    <Brain className="size-3.5" />
                  </span>
                  <div className="flex-1 whitespace-pre-wrap text-[14.5px] leading-relaxed text-[color:var(--text)]">
                    {t.content || (
                      <span className="italic text-[color:var(--text-muted)]">
                        (no plain-text response — see proposed draft below)
                      </span>
                    )}
                  </div>
                </div>
                {t.proposals.map((p) => (
                  <ProposalCard key={p.draftId} p={p} />
                ))}
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-center gap-2 px-4 py-3 font-mono text-xs text-[color:var(--text-dim)]">
              <Sparkles className="size-3.5 animate-pulse text-[color:var(--accent)]" />
              advisor thinking...
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <div className="sticky bottom-4 mt-8">
          <div className="relative flex items-center gap-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-1)] px-2 py-2 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5)] transition-colors focus-within:bg-[color:var(--bg-2)]">
            <span className="pl-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
              you
            </span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send(input);
              }}
              placeholder={
                thread.length
                  ? "Reply..."
                  : "Describe a workflow, a near-miss, or ask what to add..."
              }
              disabled={busy}
              className="flex-1 bg-transparent px-2 py-2 text-[15px] text-[color:var(--text)] placeholder:text-[color:var(--text-dim)]"
            />
            <button
              onClick={() => send(input)}
              disabled={busy || !input.trim()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--text)] transition-colors hover:border-[color:var(--accent)]/40 hover:bg-[color:var(--bg-3)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              {busy ? (
                <Sparkles className="size-3.5 animate-pulse" />
              ) : (
                <Send className="size-3.5 text-[color:var(--accent)]" />
              )}
              {busy ? "Sending" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ProposalCard({ p }: { p: Proposal }) {
  const actionTone =
    p.ruleAction === "deny"
      ? "border-[color:var(--danger)]/30 bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
      : p.ruleAction === "require_approval"
        ? "border-[color:var(--warn)]/30 bg-[color:var(--warn-soft)] text-[color:var(--warn)]"
        : "border-[color:var(--success)]/30 bg-[color:var(--success-soft)] text-[color:var(--success)]";
  return (
    <div className="ml-10 rounded-xl border border-[color:var(--accent)]/30 bg-[color:var(--accent-soft)] p-4">
      <div className="mb-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[color:var(--accent-strong)]">
        <ShieldPlus className="size-3.5" />
        Proposed draft &middot; {p.ruleId}
      </div>
      <div className="mb-3 text-[14.5px] leading-snug text-[color:var(--text)]">
        {p.plainEnglish}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] ${actionTone}`}
        >
          {p.ruleAction.replace("_", " ")}
        </span>
        <span className="font-mono text-[11px] text-[color:var(--text-muted)]">
          tool: <span className="text-[color:var(--text)]">{p.ruleTool}</span>
        </span>
        {p.ruleDataClass !== "NONE" && (
          <span className="font-mono text-[11px] text-[color:var(--text-muted)]">
            class: <span className="text-[color:var(--text)]">{p.ruleDataClass}</span>
          </span>
        )}
      </div>
      <a
        href="/digest"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--accent)] hover:text-[color:var(--accent-strong)]"
      >
        Review &amp; ratify in /digest
        <ArrowRight className="size-3" />
      </a>
    </div>
  );
}
