import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: vi.fn(() => ({})) }));
vi.mock("@/lib/rooms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rooms")>();
  return { ...actual, prismaRoomStore: vi.fn(() => ({})), admitParticipant: vi.fn() };
});

import { POST } from "@/app/api/livekit/token/route";
import { admitParticipant, RoomError, type AdmitResult, type RoomErrorCode } from "@/lib/rooms";
import { getSession } from "@/lib/session";

type SessionResult = NonNullable<Awaited<ReturnType<typeof getSession>>>;

function sessionFor(id = "user_1", name = "Priya"): SessionResult {
  const now = new Date();

  return {
    session: {
      id: "session_1",
      token: "session-token",
      userId: id,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id,
      name,
      email: `${id}@example.com`,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function admitted(overrides: Partial<AdmitResult> = {}): AdmitResult {
  return {
    room: {
      id: "room_1",
      slug: "design-review-abc123",
      name: "Design Review",
      status: "live",
      hostId: "user_1",
    },
    participant: {
      id: "p_1",
      roomId: "room_1",
      userId: "user_1",
      displayName: "Priya",
      role: "host",
    },
    role: "host",
    identity: "user_1",
    ...overrides,
  };
}

const TokenResponseSchema = z.object({
  token: z.string().min(20),
  url: z.url(),
  room: z.object({ slug: z.string(), name: z.string() }),
  roomId: z.string(),
  role: z.enum(["host", "moderator", "participant", "viewer"]),
  identity: z.string(),
});

function post(body: unknown): Request {
  return new Request("http://localhost:3000/api/livekit/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function payloadOf(jwt: string): {
  sub: string;
  name: string;
  metadata: string;
  video: { room: string; canPublish: boolean };
} {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
}

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(admitParticipant).mockReset();
});

describe("POST /api/livekit/token", () => {
  it("rejects anonymous callers before touching rooms", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const response = await POST(post({ slug: "design-review-abc123" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(admitParticipant).not.toHaveBeenCalled();
  });

  it("admits a guest with a display name without a session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(admitParticipant).mockResolvedValue(
      admitted({
        participant: {
          id: "p_guest",
          roomId: "room_1",
          userId: null,
          displayName: "Marcus",
          role: "participant",
        },
        role: "participant",
        identity: "guest:p_guest",
      }),
    );

    const response = await POST(post({ slug: "design-review-abc123", displayName: " Marcus " }));

    expect(response.status).toBe(200);
    expect(admitParticipant).toHaveBeenCalledWith(expect.anything(), {
      slug: "design-review-abc123",
      displayName: "Marcus",
    });

    const body = TokenResponseSchema.parse(await response.json());
    expect(body.role).toBe("participant");
    expect(body.identity).toBe("guest:p_guest");
    expect(payloadOf(body.token).sub).toBe("guest:p_guest");
  });

  it("rejects malformed JSON and non-slug values", async () => {
    vi.mocked(getSession).mockResolvedValue(sessionFor());

    expect((await POST(post("{"))).status).toBe(400);
    expect((await POST(post({ slug: "Not A Slug!" }))).status).toBe(400);
    expect(admitParticipant).not.toHaveBeenCalled();
  });

  it("rejects unknown body keys so callers cannot claim a role", async () => {
    vi.mocked(getSession).mockResolvedValue(sessionFor());

    const response = await POST(post({ slug: "design-review-abc123", role: "host" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
    expect(admitParticipant).not.toHaveBeenCalled();
  });

  it.each<[RoomErrorCode, number]>([
    ["ROOM_NOT_FOUND", 404],
    ["ROOM_NOT_LIVE", 409],
    ["ROOM_ENDED", 409],
  ])("maps %s to %i", async (code, status) => {
    vi.mocked(getSession).mockResolvedValue(sessionFor());
    vi.mocked(admitParticipant).mockRejectedValue(new RoomError(code, "nope"));

    const response = await POST(post({ slug: "design-review-abc123" }));

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
  });

  it("returns a signed token for an admitted member", async () => {
    vi.mocked(getSession).mockResolvedValue(sessionFor("user_1", "Priya"));
    vi.mocked(admitParticipant).mockResolvedValue(admitted());

    const response = await POST(post({ slug: "design-review-abc123" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = TokenResponseSchema.parse(await response.json());
    expect(body).toMatchObject({
      url: "wss://test.livekit.cloud",
      room: { slug: "design-review-abc123", name: "Design Review" },
      role: "host",
      identity: "user_1",
    });

    const payload = payloadOf(body.token);
    expect(payload.sub).toBe("user_1");
    expect(payload.name).toBe("Priya");
    expect(payload.video.room).toBe("design-review-abc123");
    expect(payload.video.canPublish).toBe(true);
    expect(JSON.parse(payload.metadata)).toEqual({ role: "host", roomId: "room_1" });
  });

  it("derives the role from the admission result, not the request", async () => {
    vi.mocked(getSession).mockResolvedValue(sessionFor("user_2", "Sam"));
    vi.mocked(admitParticipant).mockResolvedValue(
      admitted({
        participant: {
          id: "p_2",
          roomId: "room_1",
          userId: "user_2",
          displayName: "Sam",
          role: "viewer",
        },
        role: "viewer",
        identity: "user_2",
      }),
    );

    const response = await POST(post({ slug: "design-review-abc123" }));
    const body = TokenResponseSchema.parse(await response.json());

    expect(body.role).toBe("viewer");
    expect(payloadOf(body.token).video.canPublish).toBe(false);
  });
});
