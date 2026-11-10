import { createHmac, timingSafeEqual } from "node:crypto";

import { describe, expect, it } from "vitest";

import { mintRoomToken, TOKEN_TTL_SECONDS } from "@/lib/livekit";
import { buildRoomSlug, can, canPublish, parseRole, type Role } from "@/lib/room-policy";

type JwtPayload = {
  sub: string;
  name: string;
  exp: number;
  nbf: number;
  metadata: string;
  video: {
    room: string;
    roomJoin: boolean;
    canPublish: boolean;
    canSubscribe: boolean;
    canPublishData: boolean;
  };
};

function decode(jwt: string): { payload: JwtPayload; signed: string; signature: string } {
  const [header, payload, signature] = jwt.split(".");
  return {
    payload: JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as JwtPayload,
    signed: `${header}.${payload}`,
    signature,
  };
}

function sign(input: { room: string; role: Role; identity?: string }) {
  return mintRoomToken({
    identity: input.identity ?? "user_123",
    name: "Priya",
    role: input.role,
    room: input.room,
    roomId: "room_abc",
  });
}

describe("mintRoomToken", () => {
  it("encodes identity, room and role metadata with a 2-hour TTL", async () => {
    const jwt = await sign({ room: "design-review", role: "host" });
    const { payload } = decode(jwt);

    expect(payload.sub).toBe("user_123");
    expect(payload.name).toBe("Priya");
    expect(payload.video.room).toBe("design-review");
    expect(payload.video.roomJoin).toBe(true);
    expect(payload.video.canSubscribe).toBe(true);
    // LiveKit JWT uses `nbf` (not `iat`) as the issue timestamp.
    expect(payload.exp - payload.nbf).toBe(TOKEN_TTL_SECONDS);
    expect(TOKEN_TTL_SECONDS).toBeLessThanOrEqual(2 * 60 * 60);
    expect(JSON.parse(payload.metadata)).toEqual({ role: "host", roomId: "room_abc" });
  });

  it("grants publish to host, moderator and participant", async () => {
    for (const role of ["host", "moderator", "participant"] as const) {
      const { payload } = decode(await sign({ room: "r", role }));
      expect(payload.video.canPublish, role).toBe(true);
      expect(payload.video.canPublishData, role).toBe(true);
    }
  });

  it("makes viewer listen-only at the SFU level", async () => {
    const { payload } = decode(await sign({ room: "webinar", role: "viewer" }));

    expect(payload.video.canPublish).toBe(false);
    expect(payload.video.canPublishData).toBe(false);
    expect(payload.video.canSubscribe).toBe(true);
  });

  it("signs the token with LIVEKIT_API_SECRET", async () => {
    const { signed, signature } = decode(await sign({ room: "r", role: "participant" }));
    const expected = createHmac("sha256", "test-livekit-secret").update(signed).digest("base64url");

    expect(signature).toHaveLength(expected.length);
    expect(timingSafeEqual(Buffer.from(signature), Buffer.from(expected))).toBe(true);
  });
});

describe("role policy (RBAC doc §2)", () => {
  it("allows only hosts to promote and record", () => {
    expect(can("host", "promote")).toBe(true);
    expect(can("moderator", "promote")).toBe(false);
    expect(can("host", "record")).toBe(true);
    expect(can("moderator", "record")).toBe(false);
    expect(can("participant", "record")).toBe(false);
  });

  it("allows hosts and moderators to mute and kick", () => {
    for (const role of ["host", "moderator"] as const) {
      expect(can(role, "muteOthers"), role).toBe(true);
      expect(can(role, "kick"), role).toBe(true);
    }
    expect(can("participant", "muteOthers")).toBe(false);
    expect(can("viewer", "kick")).toBe(false);
  });

  it("denies publishing to viewers only", () => {
    expect(canPublish("host")).toBe(true);
    expect(canPublish("moderator")).toBe(true);
    expect(canPublish("participant")).toBe(true);
    expect(canPublish("viewer")).toBe(false);
  });

  it("parses roles safely at trust boundaries", () => {
    expect(parseRole("moderator")).toBe("moderator");
    expect(parseRole("admin")).toBeNull();
    expect(parseRole(null)).toBeNull();
  });
});

describe("buildRoomSlug", () => {
  it("normalizes a name into a URL-safe prefix plus suffix", () => {
    expect(buildRoomSlug("  Product Demo!! ", "a1b2c3")).toBe("product-demo-a1b2c3");
  });

  it("falls back to 'room' for symbol-only names and trims separators", () => {
    expect(buildRoomSlug("———", "a1b2c3")).toBe("room-a1b2c3");
    expect(buildRoomSlug("Design / Review", "a1b2c3")).toBe("design-review-a1b2c3");
  });

  it("caps the readable prefix at 40 characters", () => {
    const slug = buildRoomSlug("x".repeat(80), "a1b2c3");
    expect(slug).toBe(`${"x".repeat(40)}-a1b2c3`);
  });
});
