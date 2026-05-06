"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, X, Edit3, ShieldAlert, Brain, ChevronDown, ChevronUp, Hash, Clock } from "lucide-react";
import type { DigestCardSummary } from "@/lib/types";
import { Badge } from "./Badge";
import { cn, dataClassColor, ruleColor, shortId, timeAgo } from "@/lib/utils";

type Props = {
  draft: DigestCardSummary;
  onDecide: (next: { action: "accept" | "dismiss"; draftId: string }) => void;
};

export function DraftCard({ draft, onDecide }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<"none" | "accept" | "dismiss">("none");
  const [decided, setDecided] = useState<null | "accepted" | "dismissed">(null);

  async function decide(kind: "accept" | "dismiss") {
    setBusy(kind);
    try {
      const url =
        kind === "accept"
          ? `/api/drafts/${draft.id}/ratify`
          : `/api/drafts/${draft.id}/dismiss`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: kind === "accept" ? JSON.stringify({ ratifiedBy: "operator" }) : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDecided(kind === "accept" ? "accepted" : "dismissed");
      setTimeout(() => onDecide({ action: kind, draftId: draft.id }), 600);
    } catch (err) {
      console.error(err);
      setBusy("none");
    }
  }

  const ruleColorClass = ruleColor(draft.ruleAction);
  const dcClass = dataClassColor(draft.ruleDataClass);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: decided ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, x: 80, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-1)]",
        decided === "accepted" && "border-[color:var(--accent)]/40",
        decided === "dismissed" && "border-[color:var(--danger)]/30",
      )}
    >
      {/* Header strip — runId + status + claude attribution */}
      <div className="flex items-center justify-between border-b border-[color:var(--line)] bg-[color:var(--bg-2)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Brain className="size-3.5 text-[color:var(--violet)]" />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            Drafted by Claude
          </span>
          <span className="text-[color:var(--text-dim)]">·</span>
          <span className="font-mono text-[11px] text-[color:var(--text-muted)]">
            {timeAgo(draft.createdAt)}
          </span>
        </div>
        <Badge tone="violet" className="!px-2">
          <Hash className="size-3" /> {draft.ruleId}
        </Badge>
      </div>

      {/* Body */}
      <div className="px-5 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider",
              ruleColorClass,
            )}
          >
            <ShieldAlert className="size-3" />
            {draft.ruleAction.replace("_", " ")}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px]",
              "border-[color:var(--line-strong)] bg-[color:var(--bg-2)] text-[color:var(--text)]",
            )}
          >
            tool:&nbsp;<span className="font-semibold">{draft.ruleTool}</span>
          </span>
          {draft.ruleDataClass !== "NONE" && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px] uppercase",
                dcClass,
              )}
            >
              {draft.ruleDataClass}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-[color:var(--text-dim)]">
            <Clock className="size-3" /> repeated <strong className="text-[color:var(--text)]">{draft.cluster.count}×</strong>
          </span>
        </div>

        <p className="mt-4 text-[15px] leading-relaxed text-[color:var(--text)]">
          {draft.plainEnglish}
        </p>

        {/* Diff-style policy preview */}
        <div className="mt-4 rounded-md border border-[color:var(--line)] bg-[color:var(--bg-0)] p-3 font-mono text-[12.5px] leading-6">
          <div className="flex items-center gap-2 text-[color:var(--text-dim)]">
            <span>$</span>
            <span>policy_update</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider">proposed</span>
          </div>
          <div className="mt-1.5 text-[color:var(--accent)]">
            <span className="text-[color:var(--text-dim)]">+ </span>
            Policy new: {actionVerb(draft.ruleAction)} {draft.ruleTool}
            {draft.ruleDataClass !== "NONE" ? ` for ${draft.ruleDataClass}` : ""}
          </div>
        </div>

        {/* Dry-run stats */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="DRY-RUN MATCHED" value={`${draft.dryRunMatched} / ${draft.cluster.count}`} tone="accent" />
          <Stat label="FALSE POSITIVES" value={draft.dryRunFalsePos} tone={draft.dryRunFalsePos === 0 ? "accent" : "warn"} />
          <Stat label="BASED ON" value={`${draft.basedOnEventIds.length} events`} tone="violet" />
        </div>

        {/* Reasoning */}
        <button
          onClick={() => setExpanded((s) => !s)}
          className="mt-4 inline-flex cursor-pointer items-center gap-1 text-[12px] text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
        >
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          <span className="font-mono uppercase tracking-wider">
            {expanded ? "Hide" : "Show"} reasoning &amp; events
          </span>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="exp"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="mt-3 rounded-md border border-[color:var(--line)] bg-[color:var(--bg-2)] p-3 text-[13px] leading-relaxed text-[color:var(--text-muted)]">
                {draft.reasoning}
              </div>
              <div className="mt-3 space-y-2">
                {draft.cluster.sampleEvents.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-md border border-[color:var(--line)] bg-[color:var(--bg-0)] px-3 py-2 font-mono text-[11.5px]"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[color:var(--text-dim)]">
                      <span>runId:</span>
                      <span className="text-[color:var(--info)]">{e.runId ? shortId(e.runId, 10) : "—"}</span>
                      <span>·</span>
                      <span className={e.action === "policy_deny" ? "text-[color:var(--danger)]" : "text-[color:var(--warn)]"}>
                        {e.action}
                      </span>
                      <span className="ml-auto">{timeAgo(e.executedAt)}</span>
                    </div>
                    <pre className="mt-1 whitespace-pre-wrap break-all text-[color:var(--text)]/85">
                      {JSON.stringify(e.input, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Action footer */}
      <footer className="flex items-center gap-2 border-t border-[color:var(--line)] bg-[color:var(--bg-2)] px-4 py-3">
        <button
          onClick={() => decide("accept")}
          disabled={busy !== "none"}
          className={cn(
            "inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors duration-150",
            "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/10 text-[color:var(--accent)] hover:bg-[color:var(--accent)]/20",
            busy === "accept" && "opacity-60",
          )}
        >
          <CheckCircle2 className="size-4" />
          {busy === "accept" ? "Promoting…" : "Accept policy"}
        </button>
        <button
          disabled
          className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-md border border-[color:var(--line-strong)] bg-[color:var(--bg-1)] px-3 py-2 font-mono text-xs uppercase tracking-wider text-[color:var(--text-dim)]"
          title="Inline editor coming soon"
        >
          <Edit3 className="size-4" /> Edit
        </button>
        <button
          onClick={() => decide("dismiss")}
          disabled={busy !== "none"}
          className={cn(
            "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors duration-150",
            "border-[color:var(--line-strong)] text-[color:var(--text-muted)] hover:border-[color:var(--danger)]/50 hover:bg-[color:var(--danger)]/10 hover:text-[color:var(--danger)]",
            busy === "dismiss" && "opacity-60",
          )}
        >
          <X className="size-4" /> Dismiss
        </button>
      </footer>

      {/* Overlay states */}
      <AnimatePresence>
        {decided && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center backdrop-blur-[1px]",
              decided === "accepted"
                ? "bg-[color:var(--accent)]/5"
                : "bg-[color:var(--danger)]/5",
            )}
          >
            <div
              className={cn(
                "rounded-md border px-4 py-2 font-mono text-sm uppercase tracking-wider",
                decided === "accepted"
                  ? "border-[color:var(--accent)]/40 bg-[color:var(--bg-1)] text-[color:var(--accent)]"
                  : "border-[color:var(--danger)]/40 bg-[color:var(--bg-1)] text-[color:var(--danger)]",
              )}
            >
              {decided === "accepted" ? "Promoted to live" : "Dismissed"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function actionVerb(a: "allow" | "deny" | "require_approval") {
  if (a === "allow") return "allow";
  if (a === "deny") return "block";
  return "require approval for";
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone: "accent" | "warn" | "violet" }) {
  const ring: Record<string, string> = {
    accent: "border-[color:var(--accent)]/30",
    warn: "border-[color:var(--warn)]/30",
    violet: "border-[color:var(--violet)]/30",
  };
  return (
    <div className={cn("rounded-md border bg-[color:var(--bg-0)] px-3 py-2", ring[tone])}>
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-[color:var(--text)]">{value}</div>
    </div>
  );
}
