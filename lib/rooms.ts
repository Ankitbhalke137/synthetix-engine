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
