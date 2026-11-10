import { z } from "zod";

/**
 * Single source of truth for server-side environment variables.
 *
 * Parsing is LAZY (`getEnv()` at use site, not module import) so that
 * `next build` succeeds in CI without secrets — see AGENTS.md golden rules.
 */
export const EnvSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),

  NEON_STORAGE_ENDPOINT: z.url(),
  NEON_STORAGE_ACCESS_KEY_ID: z.string().min(1),
  NEON_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  NEON_STORAGE_BUCKET_NAME: z.string().min(1).default("synthetix-recordings"),
  NEON_STORAGE_REGION: z.string().min(1).default("us-east-2"),

  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),

  GROQ_API_KEY: z.string().min(1),

  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // P1 — GitHub OAuth (optional until enabled)
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * Returns the validated environment. Throws with a readable list of every
 * invalid/missing variable on first call.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(parsed.error)}\n\n` +
        "Copy .env.example to .env.local and fill in the values.",
    );
  }

  cached = parsed.data;
  return cached;
}
