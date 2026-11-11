import "server-only";

import { Redis } from "@upstash/redis";

import { getEnv } from "@/lib/env";

/**
 * Quota guards (binding AGENTS.md §3):
 *
 *  - LiveKit free: 5,000 WebRTC participant-min/mo (hard cap — new requests
 *    fail when exceeded). Preflight guard blocks join when projected usage
 *    would exceed remaining budget.
 *  - Groq free: 2,000 req/day, 10 s min-billable → 20,000 audio-s/day.
 *    VAD chunks 8–12 s → ~1,600–2,400 chunks/day headroom. We cap at
 *    1,500 chunks/day to leave margin.
 *
 * Counters live in Upstash (Redis) with TTLs aligned to the reset window.
 * Fails open — quota checks never block the call itself.
 */

let redis: Redis | null = null;

function getRedis(): Redis {
  if (redis) return redis;

  const env = getEnv();

  redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  return redis;
}

/** LiveKit budget: 5,000 participant-minutes per month. */
export const LIVEKIT_PARTICIPANT_MIN_PER_MONTH = 5000;

/** Groq budget: cap chunks/day at 1,500 (headroom under 2,000 req/day). */
export const GROQ_CHUNKS_PER_DAY = 1500;

/**
 * Seconds until the end of the current UTC day (for Groq daily counter TTL).
 */
function secondsUntilMidnightUtc(): number {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.floor((tomorrow.getTime() - now.getTime()) / 1000);
}

/**
 * Seconds until the end of the current month (for LiveKit monthly counter TTL).
 */
function secondsUntilMonthEnd(): number {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.floor((nextMonth.getTime() - now.getTime()) / 1000);
}

/**
 * Increment the LiveKit participant-minutes counter for the current month.
 * Call when a room session ends (or on join as an estimate).
 */
export async function addLiveKitParticipantMinutes(minutes: number): Promise<void> {
  try {
    const key = "quotas:livekit:participant-min:monthly";
    const redis = getRedis();

    await redis.incrby(key, minutes);
    await redis.expireat(key, Math.floor(Date.now() / 1000) + secondsUntilMonthEnd());
  } catch {
    // Fail open — quota tracking must never block the call.
  }
}

/**
 * Read LiveKit participant-minutes used this month.
 */
export async function getLiveKitParticipantMinutesUsed(): Promise<number> {
  try {
    const key = "quotas:livekit:participant-min:monthly";
    const value = await getRedis().get(key);
    return value ? Number(value) : 0;
  } catch {
    return 0;
  }
}

/**
 * Preflight check: would adding `projectedMinutes` exceed the LiveKit budget?
 * Returns { allowed, remainingMinutes, message }.
 */
export async function checkLiveKitBudget(projectedMinutes: number): Promise<{
  allowed: boolean;
  remainingMinutes: number;
  message?: string;
}> {
  try {
    const used = await getLiveKitParticipantMinutesUsed();
    const remaining = Math.max(0, LIVEKIT_PARTICIPANT_MIN_PER_MONTH - used);
    const allowed = remaining >= projectedMinutes;

    return {
      allowed,
      remainingMinutes: remaining,
      message: allowed
        ? undefined
        : `LiveKit budget exhausted for this month (~${LIVEKIT_PARTICIPANT_MIN_PER_MONTH} participant-min). Reset at month start.`,
    };
  } catch {
    return { allowed: true, remainingMinutes: LIVEKIT_PARTICIPANT_MIN_PER_MONTH };
  }
}

/**
 * Increment the Groq chunks counter for today. Returns the new count.
 */
export async function incrementGroqChunksToday(): Promise<number> {
  try {
    const key = "quotas:groq:chunks:daily";
    const redis = getRedis();

    const count = await redis.incr(key);
    // Set TTL on first increment of the day.
    const ttl = await redis.ttl(key);
    if (ttl === -1) {
      await redis.expire(key, secondsUntilMidnightUtc());
    }

    return Number(count);
  } catch {
    return 0;
  }
}

/**
 * Read Groq chunks used today.
 */
export async function getGroqChunksToday(): Promise<number> {
  try {
    const key = "quotas:groq:chunks:daily";
    const value = await getRedis().get(key);
    return value ? Number(value) : 0;
  } catch {
    return 0;
  }
}

/**
 * Check whether captions are allowed today (under the Groq chunk cap).
 * Returns { allowed, remaining, message }.
 */
export async function checkGroqCaptionQuota(): Promise<{
  allowed: boolean;
  remaining: number;
  message?: string;
}> {
  try {
    const used = await getGroqChunksToday();
    const remaining = Math.max(0, GROQ_CHUNKS_PER_DAY - used);
    const allowed = remaining > 0;

    return {
      allowed,
      remaining,
      message: allowed
        ? undefined
        : `Caption quota exhausted for today (~${GROQ_CHUNKS_PER_DAY} chunks). Reset at midnight UTC.`,
    };
  } catch {
    return { allowed: true, remaining: GROQ_CHUNKS_PER_DAY };
  }
}
