import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

// Node < 22 has no global WebSocket; the Neon driver needs `ws` there.
neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Lazily-created Prisma client backed by the Neon serverless driver (ADR-007).
 *
 * Lazy on purpose: nothing connects at import time, so `next build` works
 * without secrets and the client is only constructed on the first real query.
 */
export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  // The adapter owns the connection pool (PoolConfig overload).
  const adapter = new PrismaNeon({ connectionString: getEnv().DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  // Re-use across hot reloads in development to avoid pool exhaustion.
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
  }

  return prisma;
}
