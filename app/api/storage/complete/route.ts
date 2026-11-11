import { z } from "zod";

import { getPrisma } from "@/lib/prisma";
import { completeMultipartUpload, recordingKey } from "@/lib/storage";
import { getSession } from "@/lib/session";

/**
 * POST /api/storage/complete
 *
 * Complete a multipart upload and persist the Recording row. Authz:
 * authenticated + room member + host. Returns the storageKey (never a URL).
 *
 * Idempotent: a retried request for a recording that already exists returns
 * the stored row instead of asking S3 to complete a finished upload.
 */
const MAX_RECORDING_BYTES = 10 * 1024 * 1024 * 1024; // Neon multipart cap
const MAX_RECORDING_SECONDS = 24 * 60 * 60;

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
    mimeType: z.string().min(1).max(120).optional(),
    sizeBytes: z.number().int().min(0).max(MAX_RECORDING_BYTES).optional(),
    durationSec: z.number().min(0).max(MAX_RECORDING_SECONDS).optional(),
  })
  .strict();

const NO_STORE = { "cache-control": "no-store" } as const;

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

type RecordingSummary = {
  id: string;
  storageKey: string;
  status: string;
  mimeType: string;
  sizeBytes: bigint;
  durationSec: number;
  partCount: number;
  createdAt: Date;
};

function toResponse(recording: RecordingSummary) {
  return {
    ...recording,
    // Prisma returns BigInt; JSON.stringify cannot serialise it.
    sizeBytes: Number(recording.sizeBytes),
  };
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

const RECORDING_SELECT = {
  id: true,
  storageKey: true,
  status: true,
  mimeType: true,
  sizeBytes: true,
  durationSec: true,
  partCount: true,
  createdAt: true,
} as const;

export async function POST(request: Request): Promise<Response> {
  const session = await getSession(request.headers);

  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "Sign in to complete a recording.");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = CompleteRequestSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(
      400,
      "INVALID_INPUT",
      "Expected { roomId, recordingId, uploadId, parts }.",
    );
  }

  try {
    await requireRoomHost(parsed.data.roomId, session.user.id);

    const existing = await getPrisma().recording.findUnique({
      where: { id: parsed.data.recordingId },
      select: RECORDING_SELECT,
    });

    if (existing) {
      if (existing.storageKey !== recordingKey(parsed.data.roomId, parsed.data.recordingId)) {
        return errorResponse(
          409,
          "RECORDING_CONFLICT",
          "This recording id belongs to another room.",
        );
      }

      return Response.json(toResponse(existing), { status: 200, headers: NO_STORE });
    }

    let storageKey: string;

    try {
      ({ storageKey } = await completeMultipartUpload({
        uploadId: parsed.data.uploadId,
        roomId: parsed.data.roomId,
        recordingId: parsed.data.recordingId,
        parts: parsed.data.parts,
      }));
    } catch {
      // S3 specifics (EntityTooSmall, NoSuchUpload, …) are not actionable for
      // the browser and must not leak internals.
      return errorResponse(
        502,
        "STORAGE_ERROR",
        "Storage could not finalise this recording. Please try again.",
      );
    }

    const recording = await getPrisma().recording.create({
      data: {
        id: parsed.data.recordingId,
        roomId: parsed.data.roomId,
        storageKey,
        status: "ready",
        partCount: parsed.data.parts.length,
        mimeType: parsed.data.mimeType ?? "audio/webm",
        sizeBytes: BigInt(parsed.data.sizeBytes ?? 0),
        durationSec: parsed.data.durationSec ?? 0,
      },
      select: RECORDING_SELECT,
    });

    return Response.json(toResponse(recording), { status: 200, headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
