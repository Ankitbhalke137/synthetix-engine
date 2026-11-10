import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth";

// Lazy handler: getAuth() runs on the first request, never at import,
// so `next build` succeeds in CI without secrets. Route handlers are
// dynamic by default under Cache Components (next.config.ts) — do not
// add `export const dynamic` (incompatible with cacheComponents).

const handler = toNextJsHandler((request) => getAuth().handler(request));

export const { GET, POST } = handler;
