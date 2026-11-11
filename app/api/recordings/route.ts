import { z } from "zod";

import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * GET /api/recordings?roomId=<id>
 *
 * List recordings for a room. Authz: authenticated + room member.
 * Returns storageKey (never a presigned URL — URLs are minted per request
 * at playback time, see errata #4).
 */
const ListRequestSchema = z.object({
  roomId: z.string().uuid("Invalid room id."),
});

const NO_STORE = { "cache-control": "no-store" } as const;

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

export async function GET(request: Request): Promise<Response> {
  const session = await getSession(request.headers);

  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "Sign in to list recordings.");
  }

  const { searchParams } = new URL(request.url);
  const parsed = ListRequestSchema.safeParse({ roomId: searchParams.get("roomId") });

  if (!parsed.success) {
    return errorResponse(400, "INVALID_INPUT", "Expected ?roomId=<uuid>.");
  }

  // Membership: caller must be a participant in this room.
  const participant = await getPrisma().roomParticipant.findUnique({
    where: { roomId_userId: { roomId: parsed.data.roomId, userId: session.user.id } },
    select: { id: true },
  });

  if (!participant) {
    return errorResponse(403, "FORBIDDEN", "You are not a member of this room.");
  }

  const recordings = await getPrisma().recording.findMany({
    where: { roomId: parsed.data.roomId },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      durationSec: true,
      status: true,
      partCount: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(
    {
      recordings: recordings.map((r) => ({
        ...r,
        sizeBytes: r.sizeBytes ? Number(r.sizeBytes) : 0,
      })),
    },
    { status: 200, headers: NO_STORE },
  );
}
