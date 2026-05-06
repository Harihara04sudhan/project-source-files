import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Panel({
  children,
  className,
  title,
  subtitle,
  icon,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-1)] shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <span className="text-[color:var(--text-muted)]">{icon}</span>}
            <div className="min-w-0">
              {title && (
                <h3 className="truncate text-[13px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="truncate text-xs text-[color:var(--text-dim)]">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}
