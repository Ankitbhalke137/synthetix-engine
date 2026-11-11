"use server";

import { getLiveKitParticipantMinutesUsed, getGroqChunksToday } from "@/lib/quota";

/**
 * Budget chip data — remaining LiveKit participant-minutes and Groq caption
 * chunks. Fetched server-side so credentials never reach the client.
 */
export type BudgetStatus = {
  livekit: {
    used: number;
    total: number;
    remaining: number;
    pct: number; // 0-100
  };
  groq: {
    used: number;
    total: number;
    remaining: number;
    pct: number; // 0-100
  };
  blocked: boolean; // true if either quota is exhausted
};

const LIVEKIT_TOTAL = 5000; // participant-min/mo
const GROQ_TOTAL = 1500; // chunks/day (headroom under 2,000 req/day)

export async function getBudgetStatus(): Promise<BudgetStatus> {
  const [livekitUsed, groqUsed] = await Promise.all([
    getLiveKitParticipantMinutesUsed(),
    getGroqChunksToday(),
  ]);

  const livekitRemaining = Math.max(0, LIVEKIT_TOTAL - livekitUsed);
  const groqRemaining = Math.max(0, GROQ_TOTAL - groqUsed);

  return {
    livekit: {
      used: livekitUsed,
      total: LIVEKIT_TOTAL,
      remaining: livekitRemaining,
      pct: Math.round((livekitUsed / LIVEKIT_TOTAL) * 100),
    },
    groq: {
      used: groqUsed,
      total: GROQ_TOTAL,
      remaining: groqRemaining,
      pct: Math.round((groqUsed / GROQ_TOTAL) * 100),
    },
    blocked: livekitRemaining === 0 || groqRemaining === 0,
  };
}
