import { describe, expect, it } from "vitest";

import {
  admitParticipant,
  createRoom,
  RoomError,
  type ParticipantRecord,
  type RoomRecord,
  type RoomStatus,
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

function seedRoom(store: MemoryStore, status: RoomStatus = "live"): RoomRecord {
  const room = store.seed({ slug: "design-review-abc123", name: "Design Review", hostId: "host_1", status });
  store.seedParticipant({
    roomId: room.id,
    userId: "host_1",
    displayName: "Priya",
    role: "host",
  });
  return room;
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

describe("admitParticipant", () => {
  it("lets the host open a draft room and moves it to live", async () => {
    const store = memoryStore();
    const room = seedRoom(store, "draft");

    const result = await admitParticipant(store, {
      slug: room.slug,
      user: { id: "host_1", name: "Priya" },
    });

    expect(result.role).toBe("host");
    expect(result.identity).toBe("host_1");
    expect(result.room.status).toBe("live");
    expect(store.rooms.get(room.id)?.status).toBe("live");
    expect(store.markLiveCalls).toBe(1);
  });

  it("does not re-run the draft transition on reconnect", async () => {
    const store = memoryStore();
    const room = seedRoom(store, "draft");

    await admitParticipant(store, { slug: room.slug, user: { id: "host_1", name: "Priya" } });
    await admitParticipant(store, { slug: room.slug, user: { id: "host_1", name: "Priya" } });

    expect(store.markLiveCalls).toBe(1);
  });

  it("rejects non-hosts from a draft room", async () => {
    const store = memoryStore();
    const room = seedRoom(store, "draft");

    await expect(
      admitParticipant(store, { slug: room.slug, user: { id: "user_2", name: "Sam" } }),
    ).rejects.toMatchObject({ code: "ROOM_NOT_LIVE" });
    expect(store.participants.has(`${room.id}:user_2`)).toBe(false);
  });

  it("admits any authenticated user to a live room as participant", async () => {
    const store = memoryStore();
    const room = seedRoom(store, "live");

    const result = await admitParticipant(store, {
      slug: room.slug,
      user: { id: "user_2", name: "Sam" },
    });

    expect(result).toMatchObject({ role: "participant", identity: "user_2" });
    expect(result.participant.displayName).toBe("Sam");
  });

  it("preserves an existing role and display name on reconnect", async () => {
    const store = memoryStore();
    const room = seedRoom(store, "live");
    store.seedParticipant({
      roomId: room.id,
      userId: "user_3",
      displayName: "Mod Sam",
      role: "moderator",
    });

    const result = await admitParticipant(store, {
      slug: room.slug,
      user: { id: "user_3", name: "Sam" },
    });

    expect(result.role).toBe("moderator");
    expect(result.participant.displayName).toBe("Mod Sam");
  });

  it.each(["ended", "archived"] as const)("rejects %s rooms", async (status) => {
    const store = memoryStore();
    const room = seedRoom(store, status);

    await expect(
      admitParticipant(store, { slug: room.slug, user: { id: "user_2", name: "Sam" } }),
    ).rejects.toMatchObject({ code: "ROOM_ENDED" });
  });

  it("returns ROOM_NOT_FOUND for an unknown slug", async () => {
    const store = memoryStore();

    await expect(
      admitParticipant(store, { slug: "missing-000", user: { id: "user_1", name: "Priya" } }),
    ).rejects.toBeInstanceOf(RoomError);
  });

  it("admits a named guest to a live room with a server-derived identity", async () => {
    const store = memoryStore();
    const room = seedRoom(store, "live");

    const first = await admitParticipant(store, { slug: room.slug, displayName: "Guest One" });
    const second = await admitParticipant(store, { slug: room.slug, displayName: "Guest Two" });

    expect(first.role).toBe("participant");
    expect(first.identity).toMatch(/^guest:p_\d+$/);
    expect(second.identity).not.toBe(first.identity);
  });

  it("rejects guests without a display name and guests in draft rooms", async () => {
    const store = memoryStore();
    const live = seedRoom(store, "live");
    const draft = store.seed({ slug: "draft-xyz789", name: "Draft", hostId: "host_1", status: "draft" });

    await expect(
      admitParticipant(store, { slug: live.slug, displayName: "   " }),
    ).rejects.toMatchObject({ code: "DISPLAY_NAME_REQUIRED" });
    await expect(admitParticipant(store, { slug: draft.slug, displayName: "Guest" })).rejects.toMatchObject({
      code: "ROOM_NOT_LIVE",
    });
  });
});
