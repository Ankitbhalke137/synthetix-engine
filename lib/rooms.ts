import "server-only";

import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import { buildRoomSlug, type Role } from "@/lib/room-policy";

/** Mirrors the `RoomStatus` enum in prisma/schema.prisma. */
export type RoomStatus = "draft" | "live" | "ended" | "archived";

export type RoomRecord = {
  id: string;
  slug: string;
  name: string;
  status: RoomStatus;
  hostId: string;
};

export type ParticipantRecord = {
  id: string;
  roomId: string;
  userId: string | null;
  displayName: string;
  role: Role;
};

export type RoomErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_ENDED"
  | "ROOM_NOT_LIVE"
  | "DISPLAY_NAME_REQUIRED";

/** Expected, user-facing failures — route handlers map these to status codes. */
export class RoomError extends Error {
  readonly code: RoomErrorCode;

  constructor(code: RoomErrorCode, message: string) {
    super(message);
    this.name = "RoomError";
    this.code = code;
  }
}

/**
 * Narrow persistence port. Services depend on this instead of Prisma so room
 * lifecycle rules are unit-testable with an in-memory store.
 */
export type RoomStore = {
  findBySlug(slug: string): Promise<RoomRecord | null>;
  create(input: { slug: string; name: string; hostId: string; hostName: string }): Promise<RoomRecord>;
  markLive(roomId: string): Promise<void>;
  findParticipant(roomId: string, userId: string): Promise<ParticipantRecord | null>;
  upsertParticipant(input: {
    roomId: string;
    userId: string;
    displayName: string;
    role: Role;
  }): Promise<ParticipantRecord>;
  addGuest(input: { roomId: string; displayName: string }): Promise<ParticipantRecord>;
};

/** Prisma-backed adapter for `RoomStore` (the only place that speaks SQL). */
export function prismaRoomStore(db: PrismaClient): RoomStore {
  const roomSelect = {
    id: true,
    slug: true,
    name: true,
    status: true,
    hostId: true,
  } as const;

  return {
    async findBySlug(slug) {
      return db.room.findUnique({ where: { slug }, select: roomSelect });
    },

    async create({ slug, name, hostId, hostName }) {
      return db.room.create({
        data: {
          slug,
          name,
          hostId,
          // The creator is immediately a member with the host role.
          participants: { create: { userId: hostId, displayName: hostName, role: "host" } },
        },
        select: roomSelect,
      });
    },

    async markLive(roomId) {
      await db.room.update({ where: { id: roomId }, data: { status: "live" } });
    },

    async findParticipant(roomId, userId) {
      return db.roomParticipant.findUnique({
        where: { roomId_userId: { roomId, userId } },
        select: { id: true, roomId: true, userId: true, displayName: true, role: true },
      });
    },

    async upsertParticipant({ roomId, userId, displayName, role }) {
      return db.roomParticipant.upsert({
        where: { roomId_userId: { roomId, userId } },
        create: { roomId, userId, displayName, role },
        // Rejoining clears a previous kick; the role is server-derived.
        update: { displayName, leftAt: null },
        select: { id: true, roomId: true, userId: true, displayName: true, role: true },
      });
    },

    async addGuest({ roomId, displayName }) {
      return db.roomParticipant.create({
        data: { roomId, displayName, role: "participant" },
        select: { id: true, roomId: true, userId: true, displayName: true, role: true },
      });
    },
  };
}

const MAX_SLUG_ATTEMPTS = 3;

/** Prisma's unique-constraint code, read structurally (no driver import). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === "P2002";
}

/**
 * Creates a draft room owned by `host`, which also makes the host a member.
 * Slugs get a random suffix; a collision retries with a new suffix.
 */
export async function createRoom(
  store: RoomStore,
  input: { host: { id: string; name: string }; name: string; suffix?: string },
): Promise<RoomRecord> {
  const name = input.name.trim();

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    // An explicit suffix is for tests/backfills; retries must use a fresh one.
    const suffix = attempt === 1 && input.suffix ? input.suffix : randomUUID().slice(0, 6);
    const slug = buildRoomSlug(name, suffix);

    try {
      return await store.create({ slug, name, hostId: input.host.id, hostName: input.host.name });
    } catch (error) {
      const canRetry = isUniqueViolation(error) && attempt < MAX_SLUG_ATTEMPTS;
      if (!canRetry) throw error;
    }
  }

  // Unreachable: the loop either returns or throws.
  throw new Error("room slug allocation failed");
}

export type AdmitInput = {
  slug: string;
  /** Authenticated member. Omitted for guests (display name required). */
  user?: { id: string; name: string };
  displayName?: string;
};

export type AdmitResult = {
  room: RoomRecord;
  participant: ParticipantRecord;
  role: Role;
  identity: string;
};

/**
 * Admits a viewer to a room (RBAC doc §4).
 *
 * - `ended`/`archived` rooms reject everyone (read-only views are separate)
 * - a draft is host-only; the host's first admission moves it to `live`
 * - live rooms admit any authenticated user, who becomes a `participant`
 * - guests (no user) need a display name and a live room; their identity is
 *   derived from the persisted participant row, never from client input
 */
export async function admitParticipant(
  store: RoomStore,
  input: AdmitInput,
): Promise<AdmitResult> {
  const room = await store.findBySlug(input.slug);

  if (!room) {
    throw new RoomError("ROOM_NOT_FOUND", "This room does not exist.");
  }

  if (room.status === "ended" || room.status === "archived") {
    throw new RoomError("ROOM_ENDED", "This room has ended.");
  }

  if (input.user) {
    const existing = await store.findParticipant(room.id, input.user.id);
    const role: Role = existing?.role ?? (room.hostId === input.user.id ? "host" : "participant");

    if (room.status === "draft" && role !== "host" && !existing) {
      throw new RoomError("ROOM_NOT_LIVE", "The host has not started this room yet.");
    }

    const participant = await store.upsertParticipant({
      roomId: room.id,
      userId: input.user.id,
      displayName: existing?.displayName ?? input.user.name,
      role,
    });

    // First host admission is the draft → live transition.
    if (room.status === "draft" && role === "host") {
      await store.markLive(room.id);
    }

    return {
      room: room.status === "draft" && role === "host" ? { ...room, status: "live" } : room,
      participant,
      role,
      identity: input.user.id,
    };
  }

  if (room.status === "draft") {
    throw new RoomError("ROOM_NOT_LIVE", "The host has not started this room yet.");
  }

  const displayName = input.displayName?.trim();
  if (!displayName) {
    throw new RoomError("DISPLAY_NAME_REQUIRED", "Guests must provide a display name.");
  }

  const participant = await store.addGuest({ roomId: room.id, displayName });

  return {
    room,
    participant,
    role: "participant",
    identity: `guest:${participant.id}`,
  };
}
