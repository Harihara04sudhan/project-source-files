import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const ms = Date.now() - date.getTime();
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function shortId(id: string, len = 6): string {
  if (id.length <= len) return id;
  return id.slice(0, len);
}

export function ruleColor(action: "allow" | "deny" | "require_approval") {
  switch (action) {
    case "allow":
      return "text-[color:var(--accent)] border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10";
    case "deny":
      return "text-[color:var(--danger)] border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10";
    case "require_approval":
      return "text-[color:var(--warn)] border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10";
  }
}

export function dataClassColor(dc: string) {
  switch (dc) {
    case "PCI":
    case "PAYMENT":
      return "text-[color:var(--warn)] border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10";
    case "PHI":
      return "text-[color:var(--violet)] border-[color:var(--violet)]/40 bg-[color:var(--violet)]/10";
    case "PII":
      return "text-[color:var(--info)] border-[color:var(--info)]/40 bg-[color:var(--info)]/10";
    default:
      return "text-[color:var(--text-dim)] border-[color:var(--line-strong)] bg-[color:var(--bg-2)]";
  }
}
