import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { getEnv } from "@/lib/env";

/**
 * Upstash rate limiter (lazy env — `next build` works without secrets).
 *
 * Limits (binding AGENTS.md §3):
 *  - Per user: 12/min  (headroom under Groq's 20 RPM)
 *  - Per room: 20/min  (Groq RPM share across participants)
 *
 * On Upstash failure we fail open (allow the request) so the call continues.
 */
let redis: Redis | null = null;
let roomLimiter: Ratelimit | null = null;
let userLimiter: Ratelimit | null = null;

function getLimiters() {
  if (roomLimiter && userLimiter) return { roomLimiter, userLimiter };

  const env = getEnv();

  if (!redis) {
    redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }

  if (!roomLimiter) {
    roomLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "60 s"), // per room
    });
  }

  if (!userLimiter) {
    userLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(12, "60 s"), // per user
    });
  }

  return { roomLimiter, userLimiter };
}

/**
 * Check a per-room rate limit. Returns `{ success, remaining, reset }`.
 */
export async function checkRoomRateLimit(roomId: string) {
  try {
    const { roomLimiter } = getLimiters();
    return await roomLimiter.limit(`room:${roomId}`);
  } catch {
    return { success: true, remaining: 20, reset: 0 };
  }
}

/**
 * Check a per-user rate limit.
 */
export async function checkUserRateLimit(userId: string) {
  try {
    const { userLimiter } = getLimiters();
    return await userLimiter.limit(`user:${userId}`);
  } catch {
    return { success: true, remaining: 12, reset: 0 };
  }
}
