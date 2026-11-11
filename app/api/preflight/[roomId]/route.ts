import { z } from "zod";

import { checkLiveKitBudget } from "@/lib/quota";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * POST /api/preflight/[roomId]
 *
 * Preflight guard (P0-8): before a guest joins, check whether the projected
 * participant-minutes would exceed the LiveKit free-tier budget
 * (5,000 participant-min/mo, hard cap). Returns whether the join is allowed
 * and a human-readable message if not.
 *
 * Session-based (authenticated users only). Guests bypass — they're counted
 * via the host's admission flow instead.
 */
const PreflightRequestSchema = z
  .object({
    sessionMinutes: z
      .number()
      .int()
      .positive()
      .default(45)
      .refine((value) => value <= 480, "Session estimate too long."),
  })
  .strict();

const NO_STORE = { "cache-control": "no-store" } as const;

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
): Promise<Response> {
  const session = await getSession(request.headers);

  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "Sign in to check room quota.");
  }

  const { roomId } = await params;
  const body: unknown = await request.json().catch(() => null);
  const parsed = PreflightRequestSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(400, "INVALID_INPUT", "Expected { sessionMinutes }.");
  }

  // Verify the caller is a member of this room.
  const participant = await getPrisma().roomParticipant.findUnique({
    where: { roomId_userId: { roomId, userId: session.user.id } },
    select: { id: true, role: true },
  });

  if (!participant) {
    return errorResponse(403, "FORBIDDEN", "You are not a member of this room.");
  }

  // One additional participant for the projected session duration.
  const projectedMinutes = parsed.data.sessionMinutes;

  const guard = await checkLiveKitBudget(projectedMinutes);

  return Response.json(
    {
      allowed: guard.allowed,
      remainingMinutes: guard.remainingMinutes,
      projectedMinutes,
      message: guard.message,
    },
    { status: 200, headers: NO_STORE },
  );
}
