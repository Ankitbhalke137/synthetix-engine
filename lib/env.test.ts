import { describe, expect, it } from "vitest";

import { EnvSchema, getEnv } from "@/lib/env";

const VALID_ENV = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  NEON_STORAGE_ENDPOINT: "http://localhost:9000",
  NEON_STORAGE_ACCESS_KEY_ID: "key",
  NEON_STORAGE_SECRET_ACCESS_KEY: "secret",
  LIVEKIT_API_KEY: "lk-key",
  LIVEKIT_API_SECRET: "lk-secret",
  GROQ_API_KEY: "groq-key",
  UPSTASH_REDIS_REST_URL: "http://localhost:8079",
  UPSTASH_REDIS_REST_TOKEN: "token",
} as const;

describe("EnvSchema", () => {
  it("accepts a complete environment and applies storage defaults", () => {
    const parsed = EnvSchema.safeParse(VALID_ENV);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.NEON_STORAGE_BUCKET_NAME).toBe("synthetix-recordings");
      expect(parsed.data.NEON_STORAGE_REGION).toBe("us-east-2");
      expect(parsed.data.GITHUB_CLIENT_ID).toBeUndefined();
    }
  });

  it("names every missing required variable", () => {
    const parsed = EnvSchema.safeParse({});

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((issue) => issue.path.join("."));
      expect(missing).toContain("DATABASE_URL");
      expect(missing).toContain("GROQ_API_KEY");
      expect(missing).toContain("LIVEKIT_API_KEY");
      expect(missing).toContain("UPSTASH_REDIS_REST_TOKEN");
    }
  });

  it("rejects a malformed URL", () => {
    const parsed = EnvSchema.safeParse({ ...VALID_ENV, DATABASE_URL: "not-a-url" });

    expect(parsed.success).toBe(false);
  });

  it("rejects a too-short auth secret", () => {
    const parsed = EnvSchema.safeParse({ ...VALID_ENV, BETTER_AUTH_SECRET: "short" });

    expect(parsed.success).toBe(false);
  });
});

describe("getEnv", () => {
  it("returns a cached, parsed environment", () => {
    const first = getEnv();
    const original = process.env.GROQ_API_KEY;

    try {
      process.env.GROQ_API_KEY = "mutated-after-cache";
      const second = getEnv();

      expect(second).toBe(first);
      expect(second.GROQ_API_KEY).toBe("test-groq-key");
    } finally {
      process.env.GROQ_API_KEY = original;
    }
  });
});
