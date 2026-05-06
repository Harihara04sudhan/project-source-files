import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "accent" | "warn" | "danger" | "violet";
  icon?: ReactNode;
  className?: string;
}) {
  const accentBar: Record<string, string> = {
    neutral: "before:bg-[color:var(--text-dim)]",
    accent: "before:bg-[color:var(--accent)]",
    warn: "before:bg-[color:var(--warn)]",
    danger: "before:bg-[color:var(--danger)]",
    violet: "before:bg-[color:var(--violet)]",
  };
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-1)] px-4 py-4",
        "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:opacity-70",
        accentBar[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--text-dim)] font-mono">
          {label}
        </span>
        {icon && <span className="text-[color:var(--text-dim)]">{icon}</span>}
      </div>
      <div className="font-display mt-3 text-[44px] leading-none tabular-nums text-[color:var(--text)]">
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs text-[color:var(--text-muted)]">{hint}</div>
      )}
    </div>
  );
}
