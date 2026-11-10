import { describe, expect, it } from "vitest";

import {
  createRoom,
  type ParticipantRecord,
  type RoomRecord,
  type RoomStore,
} from "@/lib/rooms";

type MemoryStore = RoomStore & {
  rooms: Map<string, RoomRecord>;
  participants: Map<string, ParticipantRecord>;
  markLiveCalls: number;
  seed(room: Omit<RoomRecord, "id"> & { id?: string }): RoomRecord;
  seedParticipant(input: {
    roomId: string;
    userId: string;
    displayName: string;
    role: ParticipantRecord["role"];
  }): ParticipantRecord;
};

function memoryStore(): MemoryStore {
  const rooms = new Map<string, RoomRecord>();
  const participants = new Map<string, ParticipantRecord>();
  let seq = 0;

  const store: MemoryStore = {
    rooms,
    participants,
    markLiveCalls: 0,

    seed(room) {
      const record: RoomRecord = { id: room.id ?? `room_${(seq += 1)}`, ...room };
      rooms.set(record.id, record);
      return record;
    },

    seedParticipant({ roomId, userId, displayName, role }) {
      const record: ParticipantRecord = {
        id: `p_${(seq += 1)}`,
        roomId,
        userId,
        displayName,
        role,
      };
      participants.set(`${roomId}:${userId}`, record);
      return record;
    },

    async findBySlug(slug) {
      return [...rooms.values()].find((room) => room.slug === slug) ?? null;
    },

    async create({ slug, name, hostId, hostName }) {
      if ([...rooms.values()].some((room) => room.slug === slug)) {
        throw Object.assign(new Error("unique constraint"), { code: "P2002" });
      }

      const room = store.seed({ slug, name, hostId, status: "draft" });
      store.seedParticipant({ roomId: room.id, userId: hostId, displayName: hostName, role: "host" });
      return room;
    },

    async markLive(roomId) {
      store.markLiveCalls += 1;
      const room = rooms.get(roomId);
      if (room) rooms.set(roomId, { ...room, status: "live" });
    },

    async findParticipant(roomId, userId) {
      return participants.get(`${roomId}:${userId}`) ?? null;
    },

    async upsertParticipant({ roomId, userId, displayName, role }) {
      const key = `${roomId}:${userId}`;
      const existing = participants.get(key);
      const record: ParticipantRecord = existing
        ? { ...existing, displayName }
        : { id: `p_${(seq += 1)}`, roomId, userId, displayName, role };

      participants.set(key, record);
      return record;
    },

    async addGuest({ roomId, displayName }) {
      const record: ParticipantRecord = {
        id: `p_${(seq += 1)}`,
        roomId,
        userId: null,
        displayName,
        role: "participant",
      };
      participants.set(record.id, record);
      return record;
    },
  };

  return store;
}

describe("createRoom", () => {
  it("creates a draft room and makes the creator its host member", async () => {
    const store = memoryStore();

    const room = await createRoom(store, {
      host: { id: "user_1", name: "Priya" },
      name: "  Product Demo  ",
      suffix: "abc123",
    });

    expect(room).toMatchObject({
      slug: "product-demo-abc123",
      name: "Product Demo",
      status: "draft",
      hostId: "user_1",
    });
    expect(await store.findParticipant(room.id, "user_1")).toMatchObject({
      displayName: "Priya",
      role: "host",
    });
  });

  it("retries with a fresh suffix when the slug already exists", async () => {
    const store = memoryStore();
    store.seed({ slug: "demo-dup111", name: "Demo", hostId: "someone", status: "draft" });

    const room = await createRoom(store, {
      host: { id: "user_1", name: "Priya" },
      name: "Demo",
      suffix: "dup111",
    });

    expect(room.slug).not.toBe("demo-dup111");
    expect(room.slug.startsWith("demo-")).toBe(true);
    expect(store.rooms.size).toBe(2);
  });
});
