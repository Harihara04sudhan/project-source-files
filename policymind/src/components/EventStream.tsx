"use client";

import type { ComponentType, SVGProps } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldX, Check, RotateCcw, Hand } from "lucide-react";
import { cn, shortId, timeAgo } from "@/lib/utils";

type Event = {
  id: string;
  tool: string;
  action: "tool_call" | "policy_deny" | "rollback" | "override";
  status: "success" | "failed";
  dataClass: "PCI" | "PAYMENT" | "PHI" | "PII" | "NONE";
  runId: string | null;
  input: unknown;
  executedAt: string;
};

type IconType = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

const ACTION_META: Record<Event["action"], { icon: IconType; tone: string; label: string }> = {
  tool_call: { icon: Check, tone: "text-[color:var(--accent)] border-[color:var(--accent)]/30", label: "ALLOWED" },
  policy_deny: { icon: ShieldX, tone: "text-[color:var(--danger)] border-[color:var(--danger)]/30", label: "DENIED" },
  rollback: { icon: RotateCcw, tone: "text-[color:var(--warn)] border-[color:var(--warn)]/30", label: "ROLLBACK" },
  override: { icon: Hand, tone: "text-[color:var(--info)] border-[color:var(--info)]/30", label: "OVERRIDE" },
};

export function EventStream({ events }: { events: Event[] }) {
  return (
    <div className="max-h-[520px] overflow-y-auto">
      <ul className="divide-y divide-[color:var(--line)]">
        <AnimatePresence initial={false}>
          {events.map((e) => {
            const meta = ACTION_META[e.action];
            const Icon = meta.icon;
            return (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 py-2.5 hover:bg-[color:var(--bg-2)] cursor-default"
              >
                <div className="flex items-center gap-3">
                  <span className={cn("inline-flex size-7 items-center justify-center rounded border bg-[color:var(--bg-0)]", meta.tone)}>
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 font-mono text-[12px]">
                      <span className="font-semibold text-[color:var(--text)]">{e.tool}</span>
                      <span className={cn("text-[10px] uppercase tracking-wider", meta.tone.split(" ")[0])}>
                        {meta.label}
                      </span>
                      {e.dataClass !== "NONE" && (
                        <span className="rounded bg-[color:var(--bg-2)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-muted)]">
                          {e.dataClass}
                        </span>
                      )}
                      <span className="ml-auto text-[color:var(--text-dim)]">{timeAgo(e.executedAt)}</span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-[color:var(--text-dim)]">
                      run {e.runId ? shortId(e.runId, 10) : "—"} · {summarizeInput(e.input)}
                    </div>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const s = JSON.stringify(input);
  return s.length > 90 ? s.slice(0, 90) + "…" : s;
}
