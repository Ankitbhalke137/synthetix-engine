import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRedis = vi.hoisted(() => ({
  incr: vi.fn(),
  incrby: vi.fn(),
  expire: vi.fn(),
  expireat: vi.fn(),
  get: vi.fn(),
  ttl: vi.fn(),
}));

// Use a regular function (not arrow) so it works with `new Redis()`.
vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(function () {
    return mockRedis;
  }),
}));

import {
  checkGroqCaptionQuota,
  checkLiveKitBudget,
  GROQ_CHUNKS_PER_DAY,
  incrementGroqChunksToday,
  LIVEKIT_PARTICIPANT_MIN_PER_MONTH,
} from "./quota";

beforeEach(() => {
  Object.values(mockRedis).forEach((m) => m.mockReset());

  mockRedis.get.mockResolvedValue(null);
  mockRedis.incr.mockResolvedValue(1);
  mockRedis.incrby.mockResolvedValue(1);
  mockRedis.expire.mockResolvedValue("OK");
  mockRedis.expireat.mockResolvedValue("OK");
  mockRedis.ttl.mockResolvedValue(-1);
});

describe("checkLiveKitBudget", () => {
  it("allows when remaining minutes cover the projection", async () => {
    mockRedis.get.mockResolvedValueOnce("1000");

    const result = await checkLiveKitBudget(500);

    expect(result.allowed).toBe(true);
    expect(result.remainingMinutes).toBe(4000);
    expect(result.message).toBeUndefined();
  });

  it("blocks when projection exceeds remaining minutes", async () => {
    mockRedis.get.mockResolvedValueOnce("4900");

    const result = await checkLiveKitBudget(200);

    expect(result.allowed).toBe(false);
    expect(result.remainingMinutes).toBe(100);
    expect(result.message).toContain("exhausted");
  });

  it("allows when no usage recorded yet", async () => {
    const result = await checkLiveKitBudget(LIVEKIT_PARTICIPANT_MIN_PER_MONTH);

    expect(result.allowed).toBe(true);
    expect(result.remainingMinutes).toBe(LIVEKIT_PARTICIPANT_MIN_PER_MONTH);
  });

  it("fails open when Redis is unavailable", async () => {
    mockRedis.get.mockRejectedValueOnce(new Error("down"));

    const result = await checkLiveKitBudget(1000);

    expect(result.allowed).toBe(true);
  });
});

describe("checkGroqCaptionQuota", () => {
  it("allows when chunks remain under the daily cap", async () => {
    mockRedis.get.mockResolvedValueOnce("100");

    const result = await checkGroqCaptionQuota();

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(GROQ_CHUNKS_PER_DAY - 100);
    expect(result.message).toBeUndefined();
  });

  it("blocks when the daily cap is reached", async () => {
    mockRedis.get.mockResolvedValueOnce(String(GROQ_CHUNKS_PER_DAY));

    const result = await checkGroqCaptionQuota();

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.message).toContain("exhausted");
  });

  it("fails open when Redis is unavailable", async () => {
    mockRedis.get.mockRejectedValueOnce(new Error("down"));

    const result = await checkGroqCaptionQuota();

    expect(result.allowed).toBe(true);
  });
});

describe("incrementGroqChunksToday", () => {
  it("increments and returns the new count", async () => {
    mockRedis.incr.mockResolvedValueOnce(1);
    mockRedis.ttl.mockResolvedValueOnce(-1);

    const count = await incrementGroqChunksToday();

    expect(count).toBe(1);
    expect(mockRedis.expire).toHaveBeenCalled();
  });

  it("returns 0 when Redis is unavailable", async () => {
    mockRedis.incr.mockRejectedValueOnce(new Error("down"));

    const count = await incrementGroqChunksToday();

    expect(count).toBe(0);
  });
});
