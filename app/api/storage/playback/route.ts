import { z } from "zod";

import { getPrisma } from "@/lib/prisma";
import { presignGetObject } from "@/lib/storage";
import { getSession } from "@/lib/session";

/**
 * GET /api/storage/playback?id=<recordingId>
 *
 * Mint a presigned GET URL for playback. Authz: authenticated +
 * room member. TTL is 5 minutes, Range-enabled for seeking.
 */
const PlaybackRequestSchema = z.object({
  id: z.string().uuid("Invalid recording id."),
});

const NO_STORE = { "cache-control": "no-store" } as const;

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

async function requireRoomMember(roomId: string, userId: string) {
  const participant = await getPrisma().roomParticipant.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { role: true },
  });

  if (!participant) {
    throw errorResponse(403, "FORBIDDEN", "You are not a member of this room.");
  }

  return { role: participant.role };
}

export async function GET(request: Request): Promise<Response> {
  const session = await getSession(request.headers);

  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "Sign in to play a recording.");
  }

  const { searchParams } = new URL(request.url);
  const parsed = PlaybackRequestSchema.safeParse({ id: searchParams.get("id") });

  if (!parsed.success) {
    return errorResponse(400, "INVALID_INPUT", "Expected ?id=<recordingId>.");
  }

  const recording = await getPrisma().recording.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, roomId: true, storageKey: true, status: true },
  });

  if (!recording) {
    return errorResponse(404, "RECORDING_NOT_FOUND", "This recording does not exist.");
  }

  if (recording.status !== "ready") {
    return errorResponse(409, "RECORDING_NOT_READY", "This recording is not ready for playback.");
  }

  try {
    await requireRoomMember(recording.roomId, session.user.id);

    const { url, ttlSeconds } = await presignGetObject({
      storageKey: recording.storageKey,
    });

    return Response.json({ url, ttlSeconds, recordingId: recording.id }, {
      status: 200,
      headers: NO_STORE,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
