"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Brain, Activity, FileCheck, Inbox, Terminal, Bot, MessagesSquare } from "lucide-react";

const tabs = [
  { href: "/", label: "Cockpit", icon: Activity },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/advisor", label: "Advisor", icon: MessagesSquare },
  { href: "/digest", label: "Digest", icon: Inbox },
  { href: "/ledger", label: "Policy Ledger", icon: FileCheck },
  { href: "/demo", label: "Demo Console", icon: Terminal },
];

export function TopBar() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--line)] bg-[color:var(--bg-0)]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-6 py-3">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative inline-flex size-7 items-center justify-center rounded-md border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]">
            <Brain className="size-4" />
            <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-[color:var(--accent)] pulse-dot" />
          </span>
          <div className="leading-tight">
            <div className="font-mono text-sm font-semibold tracking-wide text-[color:var(--text)]">
              PolicyMind
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
              ArmorPolicy / Feedback Loop
            </div>
          </div>
        </Link>
        <nav className="flex items-center gap-1">
          {tabs.map((t) => {
            const Active = pathname === t.href || (t.href !== "/" && pathname.startsWith(t.href));
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "group relative flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                  Active
                    ? "text-[color:var(--text)]"
                    : "text-[color:var(--text-muted)] hover:bg-[color:var(--bg-1)] hover:text-[color:var(--text)]",
                )}
              >
                <Icon className={cn("size-3.5", Active && "text-[color:var(--accent)]")} />
                <span className="font-mono uppercase tracking-wider">{t.label}</span>
                {Active && (
                  <span className="absolute inset-x-3 -bottom-[13px] h-px bg-[color:var(--accent)]" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-md border border-[color:var(--line)] bg-[color:var(--bg-1)] px-2.5 py-1.5 md:flex">
            <span className="size-1.5 rounded-full bg-[color:var(--accent)] pulse-dot" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--text-muted)]">
              Live
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
