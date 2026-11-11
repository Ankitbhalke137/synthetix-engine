import { z } from "zod";

import { addLiveKitParticipantMinutes } from "@/lib/quota";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * POST /api/livekit/usage
 *
 * Record how long a participant stayed in a room. The preflight guard reads
 * the same monthly counter, so without this the budget chip would always show
 * a full 5,000 minutes and the guard would never block.
 *
 * Session-based, membership-checked, fail-open: usage metering must never
 * break the call.
 */
const UsageRequestSchema = z
  .object({
    roomId: z.string().uuid("Invalid room id."),
    participantSeconds: z.number().int().min(0).max(24 * 60 * 60),
  })
  .strict();

const NO_STORE = { "cache-control": "no-store" } as const;

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession(request.headers);

  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "Sign in to record room usage.");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = UsageRequestSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(400, "INVALID_INPUT", "Expected { roomId, participantSeconds }.");
  }

  const participant = await getPrisma().roomParticipant.findUnique({
    where: { roomId_userId: { roomId: parsed.data.roomId, userId: session.user.id } },
    select: { id: true },
  });

  if (!participant) {
    return errorResponse(403, "FORBIDDEN", "You are not a member of this room.");
  }

  // LiveKit bills participant-minutes; a sub-minute visit still costs one.
  const minutes = Math.max(1, Math.round(parsed.data.participantSeconds / 60));

  await addLiveKitParticipantMinutes(minutes);

  return Response.json({ minutes }, { status: 200, headers: NO_STORE });
}
