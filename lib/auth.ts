import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { getEnv } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

/**
 * Builds the Better Auth instance (ADR-004).
 *
 * Kept in a factory so `getAuth()` can cache the exact inferred instance
 * type — and so nothing is constructed at import time: `next build` must
 * not require secrets.
 */
function createAuth() {
  const env = getEnv();

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // rolling refresh once per day
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    // Login brute-force protection (per IP); Upstash limits cover API routes.
    rateLimit: {
      enabled: true,
      window: 10,
      max: 10,
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
    },
    // Required by Better Auth when calling auth APIs from server actions.
    plugins: [nextCookies()],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;

let cached: AuthInstance | null = null;

export function getAuth(): AuthInstance {
  if (cached) return cached;

  cached = createAuth();
  return cached;
}
