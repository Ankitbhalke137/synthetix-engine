import { z } from "zod";

import { getLiveKitUrl, mintRoomToken } from "@/lib/livekit";
import { getPrisma } from "@/lib/prisma";
import { admitParticipant, prismaRoomStore, RoomError, type RoomErrorCode } from "@/lib/rooms";
import { getSession } from "@/lib/session";

/**
 * Token minting is the only way into a LiveKit room (RBAC doc §3), so this
 * handler is the room's front door: authenticate → admit (membership + state)
 * → sign grants. The body can name a room but can never claim a role.
 */
const JoinRequestSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-z0-9-]+$/, "Invalid room slug."),
  })
  .strict();

const NO_STORE = { "cache-control": "no-store" } as const;

const STATUS_BY_CODE: Record<RoomErrorCode, number> = {
  ROOM_NOT_FOUND: 404,
  ROOM_ENDED: 409,
  ROOM_NOT_LIVE: 409,
  DISPLAY_NAME_REQUIRED: 400,
};

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession(request.headers);

  if (!session) {
    // Guests get their own endpoint with the studio join flow (Phase 4).
    return errorResponse(401, "UNAUTHENTICATED", "Sign in to join a room.");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = JoinRequestSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(400, "INVALID_INPUT", "Expected { slug } with a valid room slug.");
  }

  try {
    const admission = await admitParticipant(prismaRoomStore(getPrisma()), {
      slug: parsed.data.slug,
      user: { id: session.user.id, name: session.user.name },
    });

    const token = await mintRoomToken({
      identity: admission.identity,
      name: admission.participant.displayName,
      role: admission.role,
      room: admission.room.slug,
      roomId: admission.room.id,
    });

    return Response.json(
      {
        token,
        url: getLiveKitUrl(),
        room: { slug: admission.room.slug, name: admission.room.name },
        role: admission.role,
        identity: admission.identity,
      },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof RoomError) {
      return errorResponse(STATUS_BY_CODE[error.code], error.code, error.message);
    }

    throw error;
  }
}
