"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Sparkles, Trash2, Send, ChevronRight } from "lucide-react";
import { Panel } from "./Panel";

type LogLine = { ts: string; tone: "ok" | "info" | "warn" | "err"; text: string };

const presets = [
  {
    id: "wire",
    title: "Wire transfer to a new vendor",
    body: { tool: "wire_transfer", count: 3, vendor: "stage-vendor", amount: 750 },
    expect: "Drafts: deny wire_transfer for PAYMENT data",
  },
  {
    id: "email",
    title: "Email with PII attachment",
    body: { tool: "send_email", count: 4 },
    expect: "Drafts: deny send_email for PII",
  },
  {
    id: "delete",
    title: "Destructive delete_record",
    body: { tool: "delete_record", count: 3 },
    expect: "Drafts: require_approval for delete_record",
  },
];

export function DemoConsole() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);

  function log(line: Omit<LogLine, "ts">) {
    setLogs((s) => [...s, { ts: new Date().toLocaleTimeString(), ...line }]);
  }

  async function trigger(preset: (typeof presets)[number]) {
    setBusy(true);
    log({ tone: "info", text: `> simulate ${JSON.stringify(preset.body)}` });
    try {
      const r = await fetch("/api/demo/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(preset.body),
      });
      const j = await r.json();
      log({ tone: "ok", text: `+ ingested ${j.ingested?.length ?? 0} events` });
      log({ tone: "ok", text: `+ drafter created ${j.drafter?.created?.length ?? 0} policies (considered ${j.drafter?.considered ?? 0} clusters)` });
      log({ tone: "info", text: `→ open the digest to review` });
    } catch (err) {
      log({ tone: "err", text: `! ${err instanceof Error ? err.message : "unknown"}` });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    log({ tone: "warn", text: `> reset all events, drafts and ratified rules` });
    try {
      await fetch("/api/demo/reset", { method: "POST" });
      log({ tone: "ok", text: "+ database cleared" });
    } catch (err) {
      log({ tone: "err", text: `! ${err instanceof Error ? err.message : "unknown"}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-2">
      <div className="space-y-6">
        <header>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
            <Terminal className="size-3.5 text-[color:var(--accent)]" />
            Demo console
          </div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-[color:var(--text)]">
            Deny once on stage. Watch the policy write itself.
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[color:var(--text-muted)]">
            Each preset emits N synthetic deny / rollback events for the same shape, then runs the
            drafter. The next time you load the digest, a draft is already waiting.
          </p>
        </header>

        <Panel title="Stage presets" icon={<Sparkles className="size-4" />}>
          <ul className="divide-y divide-[color:var(--line)]">
            {presets.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => trigger(p)}
                  disabled={busy}
                  className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--bg-2)]"
                >
                  <ChevronRight className="size-4 shrink-0 text-[color:var(--text-dim)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--accent)]" />
                  <div className="flex-1">
                    <div className="font-mono text-[12px] uppercase tracking-wider text-[color:var(--text)]">
                      {p.title}
                    </div>
                    <div className="font-mono text-[11px] text-[color:var(--text-dim)]">
                      {p.expect}
                    </div>
                  </div>
                  <Send className="size-4 text-[color:var(--text-dim)] group-hover:text-[color:var(--accent)]" />
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-[color:var(--line)] px-4 py-3">
            <button
              onClick={reset}
              disabled={busy}
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[color:var(--danger)]/30 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 disabled:opacity-60"
            >
              <Trash2 className="size-3.5" /> Reset everything
            </button>
          </div>
        </Panel>

        <Panel title="Event ingest contract" subtitle="What ArmorPolicy POSTs to /api/events/ingest">
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[11.5px] leading-6 text-[color:var(--text-muted)]">
{`POST /api/events/ingest
{
  "tool": "wire_transfer",
  "action": "policy_deny",
  "status": "failed",
  "input": { "vendor": "...", "amount": 500 },
  "errorMessage": "operator tapped Deny",
  "runId": "...",
  "executedAt": "2026-04-29T20:12:00Z"
}`}
          </pre>
        </Panel>
      </div>

      <Panel title="Live console" icon={<Terminal className="size-4" />} className="lg:sticky lg:top-20 lg:h-[640px] lg:self-start">
        <div className="h-[560px] overflow-y-auto bg-[color:var(--bg-0)] p-4 font-mono text-[12px] leading-6">
          <AnimatePresence initial={false}>
            {logs.length === 0 ? (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[color:var(--text-dim)]">
                ready · pick a preset to fire synthetic events
                <span className="caret"> </span>
              </motion.p>
            ) : (
              logs.map((l, i) => {
                const tones = {
                  ok: "text-[color:var(--accent)]",
                  warn: "text-[color:var(--warn)]",
                  err: "text-[color:var(--danger)]",
                  info: "text-[color:var(--text)]",
                } as const;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`whitespace-pre-wrap ${tones[l.tone]}`}
                  >
                    <span className="text-[color:var(--text-dim)]">[{l.ts}]</span> {l.text}
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
        <div className="border-t border-[color:var(--line)] px-4 py-3">
          <Link
            href="/digest"
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[color:var(--accent)] hover:bg-[color:var(--accent)]/20"
          >
            Open digest <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </Panel>
    </div>
  );
}
