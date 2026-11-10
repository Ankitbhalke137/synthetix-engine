/**
 * DB smoke check — verifies the native Neon driver + generated client work
 * against the real database. Run: npm run db:smoke
 *
 * Standalone on purpose: it constructs its own client (no `server-only`
 * import), so it runs under plain tsx without the Next.js bundler.
 */
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import { config } from "dotenv";
import ws from "ws";

import { PrismaClient } from "../generated/prisma/client";

config({ path: ".env.local" });
config();

// Node < 22 has no global WebSocket; the Neon driver needs `ws` there.
neonConfig.webSocketConstructor = ws;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — copy .env.example to .env.local");

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });

  try {
    const [users, rooms, transcripts] = await Promise.all([
      prisma.user.count(),
      prisma.room.count(),
      prisma.transcript.count(),
    ]);

    console.log(`✅ Neon reachable — users: ${users}, rooms: ${rooms}, transcripts: ${transcripts}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("❌ DB smoke check failed:", error);
  process.exitCode = 1;
});
