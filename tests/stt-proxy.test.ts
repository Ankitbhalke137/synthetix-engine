import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: vi.fn(() => ({
    roomParticipant: { findUnique: vi.fn() },
    transcript: { create: vi.fn() },
    $queryRaw: vi.fn(),
  })),
}));
vi.mock("@/lib/ratelimit", () => ({
  checkUserRateLimit: vi.fn(),
  checkRoomRateLimit: vi.fn(),
}));
vi.mock("@/lib/quota", () => ({
  checkGroqCaptionQuota: vi.fn(),
  incrementGroqChunksToday: vi.fn(),
}));

import { POST } from "@/app/api/stt/transcribe/route";
import { getSession } from "@/lib/session";
import { getPrisma } from "@/lib/prisma";
import {
  checkUserRateLimit,
  checkRoomRateLimit,
} from "@/lib/ratelimit";
import {
  checkGroqCaptionQuota,
  incrementGroqChunksToday,
} from "@/lib/quota";

const mockedGetSession = vi.mocked(getSession);
const mockedGetPrisma = vi.mocked(getPrisma);
const mockedCheckUserRateLimit = vi.mocked(checkUserRateLimit);
const mockedCheckRoomRateLimit = vi.mocked(checkRoomRateLimit);
const mockedCheckGroqCaptionQuota = vi.mocked(checkGroqCaptionQuota);
const mockedIncrementGroqChunksToday = vi.mocked(incrementGroqChunksToday);
const mockedFetch = vi.fn();

global.fetch = mockedFetch;

function sessionFor(id = "user_1") {
  const now = new Date();
  return {
    session: {
      id: "session_1",
      token: "token",
      userId: id,
      expiresAt: now,
      createdAt: now,
      updatedAt: now,
    },
    user: {
      id,
      name: "Priya",
      email: `${id}@example.com`,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

const TEST_ROOM_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeRequest({ formData }: { formData: FormData }) {
  const request = {
    headers: new Headers(),
    formData: () => Promise.resolve(formData),
  } as unknown as Request;
  return POST(request);
}

beforeEach(() => {
  vi.resetAllMocks();

  mockedGetSession.mockResolvedValue(sessionFor());
  mockedGetPrisma.mockReturnValue({
    room: {
      findUnique: vi.fn().mockResolvedValue({ id: TEST_ROOM_ID, slug: TEST_ROOM_ID }),
    },
    roomParticipant: {
      findUnique: vi.fn().mockResolvedValue({
        id: "p_1",
        roomId: TEST_ROOM_ID,
        userId: "user_1",
        displayName: "Priya",
        role: "host",
      }),
    },
    transcript: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn().mockResolvedValue([{ maxSeq: 0 }]),
  } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

  mockedCheckUserRateLimit.mockResolvedValue({
    success: true,
    remaining: 11,
    reset: 0,
  });
  mockedCheckRoomRateLimit.mockResolvedValue({
    success: true,
    remaining: 19,
    reset: 0,
  });
  mockedCheckGroqCaptionQuota.mockResolvedValue({
    allowed: true,
    remaining: 1499,
    message: undefined,
  });
  mockedIncrementGroqChunksToday.mockResolvedValue(1);

  mockedFetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        text: "Hello world",
        language: "en",
        duration: 7.5,
        segments: [{ start: 0, end: 7.5, text: "Hello world" }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
});

describe("POST /api/stt/transcribe", () => {
  it("transcribes a chunk and returns text", async () => {
    const formData = new FormData();
    formData.append("roomId", TEST_ROOM_ID);
    formData.append("chunk", new Blob([new ArrayBuffer(100)]), "chunk.wav");

    const response = await makeRequest({ formData });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.text).toBe("Hello world");
    expect(body.speaker).toBe("Priya");
    expect(body.seq).toBe(1);

    // Caption was persisted.
    expect(mockedGetPrisma().transcript.create).toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockedGetSession.mockResolvedValue(null);

    const formData = new FormData();
    formData.append("roomId", TEST_ROOM_ID);
    formData.append("chunk", new Blob([new ArrayBuffer(100)]), "chunk.wav");

    const response = await makeRequest({ formData });

    expect(response.status).toBe(401);
  });

  it("returns 403 when user is not a room member", async () => {
    (mockedGetPrisma() as any).roomParticipant.findUnique.mockResolvedValue(null); // eslint-disable-line @typescript-eslint/no-explicit-any

    const formData = new FormData();
    formData.append("roomId", TEST_ROOM_ID);
    formData.append("chunk", new Blob([new ArrayBuffer(100)]), "chunk.wav");

    const response = await makeRequest({ formData });

    expect(response.status).toBe(403);
  });

  it("returns 429 when user rate limit is exceeded", async () => {
    mockedCheckUserRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: 100,
    });

    const formData = new FormData();
    formData.append("roomId", TEST_ROOM_ID);
    formData.append("chunk", new Blob([new ArrayBuffer(100)]), "chunk.wav");

    const response = await makeRequest({ formData });

    expect(response.status).toBe(429);
  });

  it("returns 429 when room rate limit is exceeded", async () => {
    mockedCheckRoomRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: 100,
    });

    const formData = new FormData();
    formData.append("roomId", TEST_ROOM_ID);
    formData.append("chunk", new Blob([new ArrayBuffer(100)]), "chunk.wav");

    const response = await makeRequest({ formData });

    expect(response.status).toBe(429);
  });

  it("returns 429 when Groq caption quota is exhausted", async () => {
    mockedCheckGroqCaptionQuota.mockResolvedValue({
      allowed: false,
      remaining: 0,
      message: "Caption quota exhausted for today.",
    });

    const formData = new FormData();
    formData.append("roomId", TEST_ROOM_ID);
    formData.append("chunk", new Blob([new ArrayBuffer(100)]), "chunk.wav");

    const response = await makeRequest({ formData });

    expect(response.status).toBe(429);
    // Groq should not be called.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("increments Groq chunk counter on successful transcription", async () => {
    const formData = new FormData();
    formData.append("roomId", TEST_ROOM_ID);
    formData.append("chunk", new Blob([new ArrayBuffer(100)]), "chunk.wav");

    await makeRequest({ formData });

    expect(mockedIncrementGroqChunksToday).toHaveBeenCalledTimes(1);
  });

  it("returns 503 when GROQ_API_KEY is not configured", async () => {
    const originalKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "PENDING";

    const formData = new FormData();
    formData.append("roomId", TEST_ROOM_ID);
    formData.append("chunk", new Blob([new ArrayBuffer(100)]), "chunk.wav");

    const response = await makeRequest({ formData });

    expect(response.status).toBe(503);

    process.env.GROQ_API_KEY = originalKey;
  });
});
