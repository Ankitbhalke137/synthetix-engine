"use client";

import { useEffect, useState } from "react";

import { getBudgetStatus } from "@/app/actions/quota";

/**
 * Budget chip — shows remaining LiveKit participant-minutes and Groq caption
 * chunks. Honest quota UX (PRD G5): warns at ≥60% burnt, blocks at 100%.
 */
export function BudgetChip() {
  const [budget, setBudget] = useState<{
    livekit: { used: number; remaining: number; pct: number };
    groq: { used: number; remaining: number; pct: number };
    blocked: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const status = await getBudgetStatus();
      if (!cancelled) {
        setBudget({
          livekit: {
            used: status.livekit.used,
            remaining: status.livekit.remaining,
            pct: status.livekit.pct,
          },
          groq: {
            used: status.groq.used,
            remaining: status.groq.remaining,
            pct: status.groq.pct,
          },
          blocked: status.blocked,
        });
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] text-text-muted animate-pulse">
        <span aria-hidden className="size-1.5 rounded-full bg-surface-2" />
        Budget…
      </span>
    );
  }

  if (!budget) return null;

  const livekitWarn = budget.livekit.pct >= 60;
  const groqWarn = budget.groq.pct >= 60;
  const blocked = budget.blocked;

  return (
    <span
      className={`flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] ${
        blocked
          ? "text-danger"
          : livekitWarn || groqWarn
            ? "text-accent"
            : "text-text-muted"
      }`}
      title={
        blocked
          ? "Quota exhausted — captions disabled and new joins blocked"
          : `LiveKit: ${budget.livekit.remaining} min left · Groq: ${budget.groq.remaining} chunks left`
      }
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${
          blocked ? "bg-danger" : livekitWarn || groqWarn ? "bg-accent" : "bg-surface-2"
        }`}
      />
      <span>
        {budget.livekit.remaining} min ·
        {budget.groq.remaining} chunks
      </span>
      {blocked ? (
        <span className="text-danger">quota exhausted</span>
      ) : livekitWarn || groqWarn ? (
        <span className="text-accent">warning</span>
      ) : null}
    </span>
  );
}
