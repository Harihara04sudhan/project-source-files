"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Point = { day: string; denies: number; success: number };

export function LearningCurve({ points }: { points: Point[] }) {
  if (!points.length) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-[color:var(--text-dim)]">
        Waiting for the first week of audit events…
      </div>
    );
  }

  const max = Math.max(1, ...points.map((p) => Math.max(p.denies, p.success)));
  const W = 600;
  const H = 160;
  const padX = 28;
  const padY = 18;
  const stepX = (W - padX * 2) / Math.max(1, points.length - 1);

  const buildPath = (key: "denies" | "success") =>
    points
      .map((p, i) => {
        const x = padX + i * stepX;
        const y = H - padY - (p[key] / max) * (H - padY * 2);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div className="px-4 py-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full">
        <defs>
          <linearGradient id="denyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--danger)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--danger)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="okGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={padX}
            x2={W - padX}
            y1={H - padY - p * (H - padY * 2)}
            y2={H - padY - p * (H - padY * 2)}
            stroke="var(--line)"
            strokeDasharray="2 4"
          />
        ))}

        {/* Success area + line */}
        <motion.path
          d={`${buildPath("success")} L ${W - padX} ${H - padY} L ${padX} ${H - padY} Z`}
          fill="url(#okGrad)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        />
        <motion.path
          d={buildPath("success")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6 }}
        />

        {/* Deny area + line */}
        <motion.path
          d={`${buildPath("denies")} L ${W - padX} ${H - padY} L ${padX} ${H - padY} Z`}
          fill="url(#denyGrad)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        />
        <motion.path
          d={buildPath("denies")}
          fill="none"
          stroke="var(--danger)"
          strokeWidth={1.5}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        />

        {/* Day labels */}
        {points.map((p, i) => (
          <text
            key={p.day}
            x={padX + i * stepX}
            y={H - 4}
            textAnchor="middle"
            fontFamily="JetBrains Mono"
            fontSize="9"
            fill="var(--text-dim)"
          >
            {p.day.slice(5)}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-4 px-2 font-mono text-[11px] text-[color:var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full bg-[color:var(--accent)]")} /> tool calls allowed
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full bg-[color:var(--danger)]")} /> policy denies
        </span>
        <span className="ml-auto text-[color:var(--text-dim)]">last 7 days</span>
      </div>
    </div>
  );
}
