import { z } from "zod";

import { getPrisma } from "@/lib/prisma";
import { completeMultipartUpload } from "@/lib/storage";
import { getSession } from "@/lib/session";

/**
 * POST /api/storage/complete
 *
 * Complete a multipart upload and persist the Recording row. Authz:
 * authenticated + room member + host. Returns the storageKey (never a URL).
 */
const CompleteRequestSchema = z
  .object({
    roomId: z.string().uuid("Invalid room id."),
    recordingId: z.string().uuid("Invalid recording id."),
    uploadId: z.string().min(1, "Upload id is required."),
    parts: z
      .array(
        z.object({
          PartNumber: z.number().int().positive(),
          ETag: z.string().min(1),
        }),
      )
      .min(1, "At least one part is required."),
  })
  .strict();

const NO_STORE = { "cache-control": "no-store" } as const;

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

async function requireRoomHost(roomId: string, userId: string) {
  const room = await getPrisma().room.findUnique({
    where: { id: roomId },
    select: { id: true, hostId: true, status: true },
  });

  if (!room) {
    throw errorResponse(404, "ROOM_NOT_FOUND", "This room does not exist.");
  }

  const participant = await getPrisma().roomParticipant.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { role: true },
  });

  if (!participant || participant.role !== "host") {
    throw errorResponse(403, "FORBIDDEN", "Only the host can complete a recording.");
  }

  return { room };
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession(request.headers);

  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "Sign in to complete a recording.");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = CompleteRequestSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(400, "INVALID_INPUT", "Expected { roomId, recordingId, uploadId, parts }.");
  }

  try {
    await requireRoomHost(parsed.data.roomId, session.user.id);

    const { storageKey } = await completeMultipartUpload({
      uploadId: parsed.data.uploadId,
      roomId: parsed.data.roomId,
      recordingId: parsed.data.recordingId,
      parts: parsed.data.parts,
    });

    const recording = await getPrisma().recording.create({
      data: {
        id: parsed.data.recordingId,
        roomId: parsed.data.roomId,
        storageKey,
        status: "ready",
        partCount: parsed.data.parts.length,
      },
      select: { id: true, storageKey: true, status: true, createdAt: true },
    });

    return Response.json(recording, { status: 200, headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
