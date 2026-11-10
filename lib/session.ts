import "server-only";

import { getAuth } from "@/lib/auth";

/**
 * Resolves the Better Auth session for the given request headers.
 * Returns null when unauthenticated — callers map that to a 401
 * (see docs/database-and-security.md §5).
 */
export async function getSession(headers: Headers) {
  return getAuth().api.getSession({ headers });
}

/**
 * Like getSession, but throws `UNAUTHENTICATED` for server actions that
 * cannot proceed anonymously. Phase 3 routes catch and map it to 401.
 */
export async function requireSession(headers: Headers) {
  const session = await getSession(headers);

  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }

  return session;
}
