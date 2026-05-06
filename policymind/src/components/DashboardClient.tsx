"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Brain, FileCheck, Inbox, ShieldAlert, Sparkles } from "lucide-react";
import { Panel } from "./Panel";
import { Stat } from "./Stat";
import { DraftCard } from "./DraftCard";
import { EventStream } from "./EventStream";
import { LearningCurve } from "./LearningCurve";
import type { DigestCardSummary, RatifiedSummary } from "@/lib/types";

type DigestPayload = {
  drafts: DigestCardSummary[];
  ratified: RatifiedSummary[];
  stats: {
    eventCount: number;
    denyCount: number;
    draftPending: number;
    ratifiedActive: number;
    last24hDenies: number;
    clusterCount: number;
  };
  recent: Array<{
    id: string;
    tool: string;
    action: "tool_call" | "policy_deny" | "rollback" | "override";
    status: "success" | "failed";
    dataClass: "PCI" | "PAYMENT" | "PHI" | "PII" | "NONE";
    runId: string | null;
    input: unknown;
    executedAt: string;
  }>;
  curve: Array<{ day: string; denies: number; success: number }>;
};

export function DashboardClient({ initial }: { initial: DigestPayload }) {
  const [data, setData] = useState<DigestPayload>(initial);
  const [polling, setPolling] = useState(true);
  const [demoBusy, setDemoBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/digest", { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.warn("[refresh] failed", err);
    }
  }, []);

  useEffect(() => {
    if (!polling) return;
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [polling, refresh]);

  function popToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  async function runSimulate() {
    setDemoBusy(true);
    try {
      const res = await fetch("/api/demo/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tool: "wire_transfer",
          count: 3,
          vendor: "stage-vendor",
          amount: 750,
        }),
      });
      const j = await res.json();
      popToast(`Simulated 3 denies → drafted ${j.drafter?.created?.length ?? 0} policies`);
      await refresh();
    } catch (err) {
      console.error(err);
      popToast("Simulation failed");
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-6 pb-16 pt-6">
      <Hero
        stats={data.stats}
        onSimulate={runSimulate}
        simulating={demoBusy}
        onTogglePolling={() => setPolling((s) => !s)}
        polling={polling}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <Stat
          label="Audit events"
          value={data.stats.eventCount.toLocaleString()}
          tone="neutral"
          icon={<Activity className="size-4" />}
          hint={`${data.stats.last24hDenies} denies in last 24h`}
        />
        <Stat
          label="Pattern clusters"
          value={data.stats.clusterCount}
          tone="violet"
          icon={<Brain className="size-4" />}
          hint="repeated decisions worth remembering"
        />
        <Stat
          label="Drafts pending"
          value={data.stats.draftPending}
          tone="warn"
          icon={<Inbox className="size-4" />}
          hint="ready for one-tap ratify"
        />
        <Stat
          label="Live policies"
          value={data.stats.ratifiedActive}
          tone="accent"
          icon={<FileCheck className="size-4" />}
          hint="ratified · enforcing now"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="This week's drafts"
          subtitle="The audit log, learned and rewritten as policy"
          icon={<Sparkles className="size-4" />}
          action={
            <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--text-dim)]">
              {data.drafts.length} pending
            </span>
          }
        >
          <div className="space-y-4 p-4">
            {data.drafts.length === 0 ? (
              <EmptyDrafts onSimulate={runSimulate} simulating={demoBusy} />
            ) : (
              <AnimatePresence mode="popLayout">
                {data.drafts.map((d) => (
                  <DraftCard
                    key={d.id}
                    draft={d}
                    onDecide={() => {
                      popToast("Refreshing…");
                      void refresh();
                    }}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Live audit stream"
            subtitle="ArmorPolicy → PolicyMind"
            icon={<ShieldAlert className="size-4" />}
            action={
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-dim)]">
                <span className="size-1.5 rounded-full bg-[color:var(--accent)] pulse-dot" />
                {polling ? "polling 5s" : "paused"}
              </span>
            }
          >
            <EventStream events={data.recent} />
          </Panel>

          <Panel title="Learning curve" subtitle="Decisions vs. denies" icon={<Activity className="size-4" />}>
            <LearningCurve points={data.curve} />
          </Panel>
        </div>
      </div>

      <Panel
        title="Live policy ledger"
        subtitle="Ratified rules · enforcing now"
        icon={<FileCheck className="size-4" />}
      >
        <RatifiedTable rows={data.ratified} />
      </Panel>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md border border-[color:var(--accent)]/40 bg-[color:var(--bg-1)] px-4 py-2 font-mono text-xs uppercase tracking-wider text-[color:var(--accent)] shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Hero({
  stats,
  onSimulate,
  simulating,
  onTogglePolling,
  polling,
}: {
  stats: DigestPayload["stats"];
  onSimulate: () => void;
  simulating: boolean;
  onTogglePolling: () => void;
  polling: boolean;
}) {
  return (
    <section className="reveal reveal-1 relative overflow-hidden rounded-2xl border border-[color:var(--line)] bg-gradient-to-br from-[color:var(--bg-1)] to-[color:var(--bg-2)] p-8 md:p-10">
      <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-[color:var(--text-dim)]">
            <Brain className="size-3.5 text-[color:var(--accent)]" />
            <span>PolicyMind &middot; closed-loop drafter</span>
          </div>
          <h1 className="font-display mt-4 text-[44px] leading-[1.05] tracking-tight text-[color:var(--text)] md:text-[60px]">
            The security policy
            <br />
            that <span className="font-display-italic text-[color:var(--gold)]">writes itself</span>
            <span className="caret text-[color:var(--accent)]" />
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-[1.65] text-[color:var(--text-muted)]">
            Every approval, denial and rollback in ArmorPolicy becomes a learning signal.
            Claude drafts the next policy in plain English. You tap once to ratify.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onSimulate}
            disabled={simulating}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 px-4 py-2 font-mono text-xs uppercase tracking-wider text-[color:var(--accent)] transition-colors hover:bg-[color:var(--accent)]/20 disabled:opacity-60"
          >
            <Sparkles className="size-3.5" />
            {simulating ? "Simulating…" : "Tap deny on stage"}
          </button>
          <button
            onClick={onTogglePolling}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
          >
            <span className={`size-1.5 rounded-full ${polling ? "bg-[color:var(--accent)]" : "bg-[color:var(--text-dim)]"}`} />
            {polling ? "polling" : "paused"}
          </button>
        </div>
      </div>
    </section>
  );
}

function EmptyDrafts({ onSimulate, simulating }: { onSimulate: () => void; simulating: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-[color:var(--line-strong)] bg-[color:var(--bg-0)] px-6 py-10 text-center">
      <Brain className="size-7 text-[color:var(--violet)]" />
      <p className="font-mono text-[12px] uppercase tracking-wider text-[color:var(--text-muted)]">
        No drafts yet — the loop is quiet.
      </p>
      <p className="max-w-xs text-[12.5px] text-[color:var(--text-dim)]">
        PolicyMind drafts a rule when it sees a pattern repeat 3+ times. Tap below to seed a
        synthetic pattern and watch it land.
      </p>
      <button
        onClick={onSimulate}
        disabled={simulating}
        className="cursor-pointer rounded-md border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[color:var(--accent)] hover:bg-[color:var(--accent)]/20"
      >
        {simulating ? "Simulating…" : "Simulate a deny"}
      </button>
    </div>
  );
}

function RatifiedTable({ rows }: { rows: RatifiedSummary[] }) {
  if (!rows.length) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-[color:var(--text-dim)]">
        No live policies yet. Accept a draft above to ratify your first rule.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full font-mono text-[12.5px]">
        <thead>
          <tr className="border-b border-[color:var(--line)] text-left text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
            <th className="px-4 py-2.5">Rule</th>
            <th className="px-4 py-2.5">Action</th>
            <th className="px-4 py-2.5">Tool</th>
            <th className="px-4 py-2.5">Class</th>
            <th className="px-4 py-2.5">Plain English</th>
            <th className="px-4 py-2.5 text-right">Ratified</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--line)]">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-[color:var(--bg-2)]">
              <td className="px-4 py-2.5 text-[color:var(--violet)]">{r.ruleId}</td>
              <td className="px-4 py-2.5">
                <span
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                    r.ruleAction === "deny"
                      ? "border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 text-[color:var(--danger)]"
                      : r.ruleAction === "require_approval"
                        ? "border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10 text-[color:var(--warn)]"
                        : "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
                  }`}
                >
                  {r.ruleAction.replace("_", " ")}
                </span>
              </td>
              <td className="px-4 py-2.5 text-[color:var(--text)]">{r.ruleTool}</td>
              <td className="px-4 py-2.5 text-[color:var(--text-muted)]">{r.ruleDataClass}</td>
              <td className="px-4 py-2.5 font-sans text-[color:var(--text)]/90">{r.plainEnglish}</td>
              <td suppressHydrationWarning className="px-4 py-2.5 text-right text-[color:var(--text-dim)]">{new Date(r.ratifiedAt).toLocaleString("en-GB")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
