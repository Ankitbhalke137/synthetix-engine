import { z } from "zod";

import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * Server-side STT proxy. The browser never touches Groq: it posts a WAV chunk
 * here, this route authenticates + checks room membership, calls Groq
 * whisper-large-v3-turbo with the server key, persists the caption, and returns
 * the text. Never logs audio contents, never returns GROQ_API_KEY.
 */
const CaptionRequestSchema = z
  .object({
    roomId: z.string().uuid("Invalid room id."),
    seq: z.number().int().nonnegative("Sequence must be a non-negative integer."),
  })
  .strict();

const NO_STORE = { "cache-control": "no-store" } as const;

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";
const MAX_CHUNK_BYTES = 2 * 1024 * 1024; // 2 MB — well under Groq's 25 MB cap

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession(request.headers);

  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "Sign in to send captions.");
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return errorResponse(400, "INVALID_INPUT", "Expected multipart/form-data.");
  }

  const parsed = CaptionRequestSchema.safeParse({
    roomId: formData.get("roomId"),
    seq: Number(formData.get("seq")),
  });

  if (!parsed.success) {
    return errorResponse(400, "INVALID_INPUT", "Expected { roomId, seq, chunk }.");
  }

  const chunk = formData.get("chunk");
  if (!(chunk instanceof File)) {
    return errorResponse(400, "INVALID_INPUT", "Expected `chunk` to be an audio file.");
  }

  if (chunk.size > MAX_CHUNK_BYTES) {
    return errorResponse(400, "CHUNK_TOO_LARGE", "Chunk must be ≤ 2 MB.");
  }

  // Membership: caller must be a participant in this room.
  const participant = await getPrisma().roomParticipant.findUnique({
    where: { roomId_userId: { roomId: parsed.data.roomId, userId: session.user.id } },
    select: { id: true, displayName: true, role: true },
  });

  if (!participant) {
    return errorResponse(403, "FORBIDDEN", "You are not a member of this room.");
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || groqKey === "PENDING") {
    return errorResponse(
      503,
      "STT_UNAVAILABLE",
      "The caption pipeline is not configured yet. Try again later.",
    );
  }

  const groqForm = new FormData();
  groqForm.append("file", chunk as File, "chunk.wav");
  groqForm.append("model", GROQ_MODEL);
  groqForm.append("response_format", "verbose_json");

  let groqResponse: Response;
  try {
    groqResponse = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: groqForm,
    });
  } catch {
    return errorResponse(502, "STT_UPSTREAM", "Could not reach the caption service.");
  }

  // Honor Groq's 429 + retry-after without charging the caller.
  if (groqResponse.status === 429) {
    const retryAfter = groqResponse.headers.get("retry-after");
    return errorResponse(
      429,
      "STT_RATE_LIMITED",
      retryAfter ? `Caption service rate limited. Retry after ${retryAfter}s.` : "Caption service rate limited.",
    );
  }

  if (!groqResponse.ok) {
    return errorResponse(502, "STT_UPSTREAM", "The caption service returned an error.");
  }

  const transcript = (await groqResponse.json().catch(() => null)) as {
    text?: string;
    language?: string;
    duration?: number;
    segments?: Array<{ start?: number; end?: number; text?: string }>;
  } | null;

  const text = transcript?.text?.trim() ?? "";
  const segments = transcript?.segments ?? [];

  // Persist idempotently — retried chunks cannot duplicate a caption row
  // (@@unique([roomId, seq])). DB failure must not fail the request.
  const startMs = Math.round((segments[0]?.start ?? 0) * 1000);
  const endMs = Math.round((segments[segments.length - 1]?.end ?? 0) * 1000);

  await getPrisma()
    .transcript.create({
      data: {
        roomId: parsed.data.roomId,
        seq: parsed.data.seq,
        speakerId: session.user.id,
        speaker: participant.displayName,
        text,
        startMs,
        endMs: endMs > startMs ? endMs : startMs + 1,
      },
    })
    .catch((error) => {
      // Idempotency: a duplicate seq is expected on retries — ignore it.
      if (typeof error === "object" && error !== null && Reflect.get(error, "code") === "P2002") {
        return;
      }
      console.error("caption persist failed:", error);
    });

  return Response.json(
    {
      text,
      language: transcript?.language,
      duration: transcript?.duration,
      segments,
      speaker: participant.displayName,
      speakerId: session.user.id,
      seq: parsed.data.seq,
    },
    { status: 200, headers: NO_STORE },
  );
}
