import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Badge({
  children,
  className,
  tone = "neutral",
  mono = true,
}: {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "accent" | "warn" | "danger" | "info" | "violet";
  mono?: boolean;
}) {
  const tones: Record<string, string> = {
    neutral:
      "border-[color:var(--line-strong)] bg-[color:var(--bg-2)] text-[color:var(--text-muted)]",
    accent:
      "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
    warn:
      "border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10 text-[color:var(--warn)]",
    danger:
      "border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 text-[color:var(--danger)]",
    info: "border-[color:var(--info)]/40 bg-[color:var(--info)]/10 text-[color:var(--info)]",
    violet:
      "border-[color:var(--violet)]/40 bg-[color:var(--violet)]/10 text-[color:var(--violet)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        mono && "font-mono",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
