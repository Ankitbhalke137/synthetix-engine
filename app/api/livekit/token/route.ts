import { z } from "zod";

import { getLiveKitUrl, mintRoomToken } from "@/lib/livekit";
import { getPrisma } from "@/lib/prisma";
import { admitParticipant, prismaRoomStore, RoomError, type RoomErrorCode } from "@/lib/rooms";
import { checkRoomRateLimit, checkUserRateLimit } from "@/lib/ratelimit";
import { getSession } from "@/lib/session";

/**
 * Token minting is the only way into a LiveKit room (RBAC doc §3), so this
 * handler is the room's front door: authenticate → admit (membership + state)
 * → sign grants. The body can name a room but can never claim a role.
 *
 * Signed-in users are identified by their session. A visitor without an
 * account may join as a guest by supplying a display name (RBAC doc §4);
 * their identity is derived from the persisted participant row.
 */
const JoinRequestSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-z0-9-]+$/, "Invalid room slug."),
    displayName: z.string().trim().min(2).max(40).optional(),
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

  const body: unknown = await request.json().catch(() => null);
  const parsed = JoinRequestSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(400, "INVALID_INPUT", "Expected { slug } with a valid room slug.");
  }

  // No session and no name means the visitor has not chosen a guest identity.
  if (!session && !parsed.data.displayName) {
    return errorResponse(401, "UNAUTHENTICATED", "Enter a display name to join as a guest.");
  }

  // Rate limit token minting so guests and users cannot brute-force room
  // admission. Fail open when Upstash is unavailable.
  const rateLimit = session
    ? await checkUserRateLimit(session.user.id)
    : await checkRoomRateLimit(parsed.data.slug);

  if (!rateLimit.success) {
    const retryAfter = Math.max(0, (rateLimit.reset ?? 0) * 1000 - Date.now());
    return Response.json(
      {
        error: {
          code: "TOKEN_RATE_LIMITED",
          message: "Too many join attempts. Please wait before trying again.",
        },
      },
      {
        status: 429,
        headers: { ...NO_STORE, "retry-after": String(Math.ceil(retryAfter / 1000)) },
      },
    );
  }

  try {
    const admission = await admitParticipant(prismaRoomStore(getPrisma()), {
      slug: parsed.data.slug,
      ...(session
        ? { user: { id: session.user.id, name: session.user.name } }
        : { displayName: parsed.data.displayName }),
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
        roomId: admission.room.id,
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
