import { describe, expect, it, vi, beforeEach } from "vitest";

const mockLimit = vi.hoisted(() => vi.fn());

const Ratelimit = vi.hoisted(() => {
  const fn = vi.fn(function Ratelimit() {
    return { limit: mockLimit };
  });
  (fn as unknown as Record<string, unknown>).slidingWindow = vi.fn();
  return fn;
});

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit,
  slidingWindow: vi.fn(),
}));

// `@upstash/ratelimit`'s import graph references `@upstash/redis`; keep it
// mocked so no real network is attempted.
vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(),
}));

import { checkRoomRateLimit, checkUserRateLimit } from "./ratelimit";

beforeEach(() => {
  mockLimit.mockClear();
});

describe("checkUserRateLimit", () => {
  it("allows when under the per-user limit", async () => {
    mockLimit.mockResolvedValue({ success: true, remaining: 11, reset: 0 });

    const result = await checkUserRateLimit("user-1");

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(11);
  });

  it("blocks when over the per-user limit", async () => {
    mockLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 30,
    });

    const result = await checkUserRateLimit("user-1");

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("fails open when the limiter throws", async () => {
    mockLimit.mockRejectedValueOnce(new Error("down"));

    const result = await checkUserRateLimit("user-1");

    expect(result.success).toBe(true);
  });
});

describe("checkRoomRateLimit", () => {
  it("allows when under the per-room limit", async () => {
    mockLimit.mockResolvedValue({ success: true, remaining: 19, reset: 0 });

    const result = await checkRoomRateLimit("room-1");

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(19);
  });

  it("blocks when over the per-room limit", async () => {
    mockLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 30,
    });

    const result = await checkRoomRateLimit("room-1");

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("fails open when the limiter throws", async () => {
    mockLimit.mockRejectedValueOnce(new Error("down"));

    const result = await checkRoomRateLimit("room-1");

    expect(result.success).toBe(true);
  });
});
