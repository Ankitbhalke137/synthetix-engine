import { z } from "zod";

import { getPrisma } from "@/lib/prisma";
import { initMultipartUpload } from "@/lib/storage";
import { getSession } from "@/lib/session";

/**
 * POST /api/storage/presigned/init
 *
 * Initiate a multipart upload for a recording. Authz: authenticated +
 * room member (host required to record). Returns an uploadId the client
 * uses to PUT parts directly to Neon Object Storage.
 */
const InitRequestSchema = z
  .object({
    roomId: z.string().uuid("Invalid room id."),
    recordingId: z.string().uuid("Invalid recording id."),
    mimeType: z.string().min(1).default("video/webm"),
  })
  .strict();

const NO_STORE = { "cache-control": "no-store" } as const;

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

/**
 * Resolve the room and verify the caller is a member. Returns the room record
 * and the caller's participant role, or throws an error response.
 */
async function requireRoomMember(roomId: string, userId: string) {
  const room = await getPrisma().room.findUnique({
    where: { id: roomId },
    select: { id: true, slug: true, status: true, hostId: true },
  });

  if (!room) {
    throw errorResponse(404, "ROOM_NOT_FOUND", "This room does not exist.");
  }

  const participant = await getPrisma().roomParticipant.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { role: true },
  });

  if (!participant) {
    throw errorResponse(403, "FORBIDDEN", "You are not a member of this room.");
  }

  return { room, role: participant.role };
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession(request.headers);

  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "Sign in to start a recording.");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = InitRequestSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(400, "INVALID_INPUT", "Expected { roomId, recordingId, mimeType }.");
  }

  try {
    const { room, role } = await requireRoomMember(parsed.data.roomId, session.user.id);

    // Recording is host-only (RBAC doc: record capability = host).
    if (role !== "host") {
      return errorResponse(403, "FORBIDDEN", "Only the host can record this room.");
    }

    if (room.status !== "live") {
      return errorResponse(409, "ROOM_NOT_LIVE", "Recording requires a live room.");
    }

    const { uploadId } = await initMultipartUpload({
      roomId: parsed.data.roomId,
      recordingId: parsed.data.recordingId,
      mimeType: parsed.data.mimeType,
    });

    return Response.json({ uploadId }, { status: 200, headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
