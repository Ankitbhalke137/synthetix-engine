import { z } from "zod";

import { getPrisma } from "@/lib/prisma";
import { presignPutPart } from "@/lib/storage";
import { getSession } from "@/lib/session";

/**
 * POST /api/storage/presigned/part
 *
 * Presign a PUT URL for one part of a multipart upload. Authz: authenticated +
 * room member + host — matching init and complete, so only the recorder can
 * mint upload URLs. The client PUTs the part bytes directly to Neon.
 */
const PartRequestSchema = z
  .object({
    roomId: z.string().uuid("Invalid room id."),
    recordingId: z.string().uuid("Invalid recording id."),
    partNumber: z.number().int().positive("Part number must be positive."),
    uploadId: z.string().min(1, "Upload id is required."),
  })
  .strict();

const NO_STORE = { "cache-control": "no-store" } as const;

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

async function requireRoomHost(roomId: string, userId: string) {
  const room = await getPrisma().room.findUnique({
    where: { id: roomId },
    select: { id: true },
  });

  if (!room) {
    throw errorResponse(404, "ROOM_NOT_FOUND", "This room does not exist.");
  }

  const participant = await getPrisma().roomParticipant.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { role: true },
  });

  if (!participant || participant.role !== "host") {
    throw errorResponse(403, "FORBIDDEN", "Only the host can upload recording parts.");
  }

  return { room };
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession(request.headers);

  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "Sign in to upload recording parts.");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = PartRequestSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(400, "INVALID_INPUT", "Expected { roomId, recordingId, partNumber, uploadId }.");
  }

  try {
    await requireRoomHost(parsed.data.roomId, session.user.id);

    const { url, ttlSeconds } = await presignPutPart({
      uploadId: parsed.data.uploadId,
      roomId: parsed.data.roomId,
      recordingId: parsed.data.recordingId,
      partNumber: parsed.data.partNumber,
    });

    return Response.json({ url, ttlSeconds }, { status: 200, headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
