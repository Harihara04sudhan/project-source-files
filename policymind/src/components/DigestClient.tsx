"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Inbox, Brain, Sparkles, Send } from "lucide-react";
import { Panel } from "./Panel";
import { DraftCard } from "./DraftCard";
import type { DigestCardSummary } from "@/lib/types";

export function DigestClient({ initial }: { initial: DigestCardSummary[] }) {
  const [drafts, setDrafts] = useState(initial);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/digest", { cache: "no-store" });
    const j = await res.json();
    setDrafts(j.drafts);
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 7000);
    return () => clearInterval(id);
  }, [refresh]);

  async function runDrafter() {
    setBusy(true);
    try {
      await fetch("/api/miner/run", { method: "POST" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <header className="rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-1)] p-6">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
          <Send className="size-3.5 text-[color:var(--accent)]" />
          telegram / @PolicyMindBot / weekly digest
        </div>
        <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-[color:var(--text)]">
          This week&apos;s draft policies
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[color:var(--text-muted)]">
          Exactly what a non-expert sees in the chat they already use. One tap to make it live, one tap to dismiss, one to edit before promoting.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={runDrafter}
            disabled={busy}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[color:var(--violet)]/40 bg-[color:var(--violet)]/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[color:var(--violet)] hover:bg-[color:var(--violet)]/20 disabled:opacity-60"
          >
            <Brain className="size-3.5" /> {busy ? "Drafting…" : "Run drafter now"}
          </button>
        </div>
      </header>

      {drafts.length === 0 ? (
        <Panel title="Inbox empty" icon={<Inbox className="size-4" />}>
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Sparkles className="size-7 text-[color:var(--accent)]" />
            <p className="font-mono text-[12px] uppercase tracking-wider text-[color:var(--text-muted)]">
              No drafts pending
            </p>
            <p className="max-w-sm text-[12.5px] text-[color:var(--text-dim)]">
              The loop is quiet. New denials, rollbacks or overrides will land here as soon as they cluster.
            </p>
          </div>
        </Panel>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {drafts.map((d) => (
              <motion.div key={d.id} layout>
                <DraftCard draft={d} onDecide={() => void refresh()} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
