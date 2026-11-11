// Deterministic fake environment for unit/integration tests.
// Never put real credentials here — CI runs with these values only.
const TEST_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
  BETTER_AUTH_URL: "http://localhost:3000",
  NEON_STORAGE_ENDPOINT: "http://localhost:9000",
  NEON_STORAGE_ACCESS_KEY_ID: "test-access-key",
  NEON_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
  NEON_STORAGE_BUCKET_NAME: "synthetix-test",
  NEON_STORAGE_REGION: "us-east-2",
  LIVEKIT_API_KEY: "test-livekit-key",
  LIVEKIT_API_SECRET: "test-livekit-secret",
  NEXT_PUBLIC_LIVEKIT_URL: "wss://test.livekit.cloud",
  GROQ_API_KEY: "test-groq-key",
  UPSTASH_REDIS_REST_URL: "http://localhost:8079",
  UPSTASH_REDIS_REST_TOKEN: "test-upstash-token",
};

// Tests must be deterministic regardless of the ambient environment (local
// `.env.local` or CI placeholders). Always override with the fake values.
for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] = value;
}
