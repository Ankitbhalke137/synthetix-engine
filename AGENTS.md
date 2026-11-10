<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Synthetix Engine

**Read this file first, every time.** It is the context hub: project state, binding rules, verified vendor facts, and the doc map. Governing docs are at the repo root — this file points, the docs decide.

---

## 1. Project snapshot

| | |
|---|---|
| **What** | Browser-based live studio: multi-guest WebRTC rooms, real-time AI captions (Groq Whisper), client-side recordings → Neon Object Storage. \$0/month free-tier stack. |
| **Why** | Showcase SDE project: requirements → architecture + ADRs → security → quality gates → CI, all engineering-doc driven. |
| **Phase** | **3 complete** (docs ✅, scaffold ✅, env/DB ✅, auth ✅, rooms + LiveKit tokens ✅ — verified on Neon + LiveKit Cloud). Next: Phase 4 (studio UI). See [`README.md`](./README.md#implementation-status). |
| **Stack** | Next.js **16.4.6** (App Router) · React 19.3 · TypeScript strict · Tailwind **v4** (CSS `@theme`, no config file) · Prisma **7** (`prisma-client` generator, `prisma7.config.ts`, generated client in `generated/`) + `@neondatabase/serverless` · Better Auth · LiveKit · Groq · Upstash · AWS S3 SDK (Neon S3 endpoint) |
| **Node** | Local **v20.20.2** — some installed packages warn they want Node ≥ 22 (`machina`, `@prisma/streams-local`). Non-blocking now; if Prisma tooling misbehaves, switch to Node 22 LTS (also matches Vercel builds). |
| **Original idea** | [`BLUEPRINT-ORIGINAL.md`](./docs/BLUEPRINT-ORIGINAL.md) — kept for provenance; **superseded** by this doc set (§6 errata). |

## 2. Golden rules (hard constraints)

1. **Docs first.** Governing doc changes in the same PR as (or before) code. Feature not in the PRD? Don't build it.
2. **Never** put `GROQ_API_KEY`, `LIVEKIT_API_SECRET`, `DATABASE_URL`, Neon storage credentials, `BETTER_AUTH_SECRET`, or the Upstash token in client code, `NEXT_PUBLIC_*`, logs, or API responses.
3. **Never** call Groq/LiveKit-server/AWS SDK from a client component. Browser → Next route/server action → vendor.
4. **Never** store presigned URLs — store `storageKey`; mint URLs per request after authz.
5. **Never** trust the client for authorization. Every room-scoped read/mutation filters by membership and role server-side (RBAC doc Layer 1).
6. **Don't change free-tier numbers from memory.** Use §3 below; re-verify with the source URL before editing them (both `architecture.md` and this file must match).
7. **No new dependencies** without PR justification; no paid services, ever.
8. **Preserve** the `nextjs-agent-rules` block above untouched.
9. **Next.js API doubt → local docs win** over training data: `node_modules/next/dist/docs/`.
10. **Size limits apply to agents:** ≤ 400 changed lines/PR, one concern, stack PRs (PR guidelines).
11. **No `any`, no `console.log`, no commented-out code** in shipped paths (quality doc).
12. **Env vars:** new one → `.env.example` + §5 table below in the same PR.

## 3. Verified free-tier facts (Nov 2026 — do not "remember" alternatives)

| Service | Limit | Source |
|---|---|---|
| Groq `whisper-large-v3-turbo` (free) | **20 RPM · 2,000 req/day · 7,200 audio-s/hour · 28,800 audio-s/day · min 10 s billed per request · 25 MB max upload** | https://console.groq.com/docs/rate-limits |
| Groq 429 behavior | `429` + `retry-after` header; never charges | same |
| LiveKit Cloud Build (free) | **5,000 WebRTC participant-min/mo · 100 concurrent · 50 GB downstream/mo · 60 transcode-min/mo · 1,000 agent-min/mo** — *hard caps: exceeding = new requests FAIL (no overage)* | https://docs.livekit.io/deploy/admin/quotas-and-limits/ · https://livekit.com/pricing |
| Neon Postgres (free) | 0.5 GiB storage, scale-to-zero, branching | https://neon.com/pricing |
| Neon Object Storage (GA Sep 2026) | **5 GB/project** · S3-compatible (subset) · presigned URLs · single PUT 5 GiB · multipart 10 GiB · branches copy-on-write with your DB · region currently **us-east-2** — copy endpoint from console | https://neon.com/docs/storage/overview · https://neon.com/blog/building-neon-object-storage |
| Vercel Hobby | 100 GB bandwidth/mo | https://vercel.com/docs/limits |
| Upstash free | 10,000 commands/day | https://upstash.com/pricing |

**Binding math (STT chunking — ADR-003):** 2,000 req/day × 10 s min-billable ≤ 28,800 ASD → use **VAD chunks 8–12 s (floor 6 s), active speaker only**. Fixed 2 s chunks need 30 RPM (> 20 available) and waste the daily budget in ~67 min of audio — never reintroduce.

**Binding math (LiveKit budget):** 4 participants × 60 min = 240 participant-min → **≈ 20 room-hours/month** (~one 45-min demo/day). Preflight guard required (PRD P0-8).

## 4. Doc map — which doc governs what

| Doc | Read when you are… |
|---|---|
| [`README.md`](./README.md) | orienting; checking status/errata/quickstart |
| [`synthetix-engine-prd.md`](./docs/synthetix-engine-prd.md) | deciding *what* to build (P0/P1/P2, non-goals, metrics) |
| [`architecture.md`](./docs/architecture.md) | making cross-cutting decisions (ADRs 001–008), budgets, failure modes |
| [`realtime-media-pipeline.md`](./docs/realtime-media-pipeline.md) | touching capture/VAD/Groq/captions/recording/upload flows |
| [`database-and-security.md`](./docs/database-and-security.md) | editing `schema.prisma`, auth config, any endpoint authz, secrets, storage |
| [`rooms-roles-and-rbac.md`](./docs/rooms-roles-and-rbac.md) | anything about roles, moderation, room lifecycle, tokens |
| [`design-spec.md`](./docs/design-spec.md) | building UI (tokens, layout, states, a11y) |
| [`nextjs-conventions.md`](./docs/nextjs-conventions.md) | writing *any* Next.js/React code in this repo |
| [`code-complexity-and-quality.md`](./docs/code-complexity-and-quality.md) | tests, CI, complexity budgets, Definition of Done |
| [`pull-request-guidelines.md`](./docs/pull-request-guidelines.md) | opening/reviewing PRs |
| [`GITFLOW.md`](./docs/GITFLOW.md) | branching, commits, Neon preview branches, merges |
| [`subagent-team.md`](./docs/subagent-team.md) | assigning/spawning agents, handoff packets, phases |
| [`BLUEPRINT-ORIGINAL.md`](./docs/BLUEPRINT-ORIGINAL.md) | only for provenance — **§6 errata overrides it** |

Conflict rule: two docs disagree → fix **both** in one docs PR, never pick silently ([subagent-team §8](./docs/subagent-team.md)).

## 5. Commands

```bash
npm run dev            # next dev — also (re)writes the agent-rules block above
npm run build          # next build (typecheck included)
npm run lint           # eslint
npx tsc --noEmit       # typecheck (also run before PR)
npm test               # vitest (unit; test:watch for dev loop)
npx prisma validate    # after schema edits (needs a DATABASE_URL — CI uses a placeholder)
npm run db:migrate     # local, on Neon `dev` branch only
npm run db:deploy      # CI/production migration apply
npm run db:smoke       # is my DATABASE_URL reachable + schema applied?
npx prisma generate    # already runs via postinstall
```

## 6. Errata vs `BLUEPRINT-ORIGINAL.md` (binding corrections)

| # | Blueprint said | Reality / decision |
|---|---|---|
| 1 | LiveKit free = "1k participant-minutes" | 5,000/min/mo + 100 concurrent + 50 GB downstream; **hard caps** |
| 2 | 2-second WAV slices to Groq | Infeasible (20 RPM, min 10 s billable) → VAD 8–12 s, active speaker only |
| 3 | Browser pushes audio to Groq | **Server proxy only** (`/api/stt/transcribe`) |
| 4 | `Recording.fileUrl` column | Removed — `storageKey` + sign-on-read |
| 5 | Storage endpoint `us-east-1` | Console says **us-east-2** (verify yours) |
| 6 | `tailwind.config.js` | Tailwind v4: tokens in `app/globals.css` `@theme` |
| 7 | Full DSP chain in worklet (EQ/noise/gain) | Cut (ADR-008): `getUserMedia` constraints + worklet meter/VAD only |
| 8 | Upstash as primary "queue" | P0 = rate limiting only; retry queue is P1 (YAGNI until 429s matter) |
| 9 | `Recording.duration` only | Added `status`, `sizeBytes`, `mimeType`, `partCount` for resume/janitor |
| 10 | Transcript `timestamp Float` | `startMs`/`endMs` ints + `seq` + `@@unique([roomId, seq])` (idempotent) |

## 7. Environment variables (`.env.example` is canonical)

| Var | Where used | Notes |
|---|---|---|
| `BETTER_AUTH_SECRET` | server | ≥ 32 random bytes; rotate on leak |
| `BETTER_AUTH_URL` | server | must equal deployed URL in prod |
| `DATABASE_URL` | server | **pooled** Neon string (`ep-…-pooler`) — ADR-007 |
| `NEON_STORAGE_ENDPOINT` | server | from Neon console (S3-compatible, us-east-2) |
| `NEON_STORAGE_ACCESS_KEY_ID` / `NEON_STORAGE_SECRET_ACCESS_KEY` | server | scoped Neon credential (storage read/write) |
| `NEON_STORAGE_BUCKET_NAME` / `NEON_STORAGE_REGION` | server | `synthetix-recordings` / `us-east-2` |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | server | token minting + moderation server API |
| `NEXT_PUBLIC_LIVEKIT_URL` | client | **the only** secret-adjacent public var (URL, not key) |
| `GROQ_API_KEY` | server | STT proxy only — never client |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | server | ratelimit (P0), retry queue (P1) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | server | OAuth — P1 only |

## 8. External references (authoritative — read before building the feature)

**Next.js (local first):** `node_modules/next/dist/docs/` → guides for app router, route handlers, server actions, caching, `next/image`, metadata.
**Auth:** Better Auth — https://www.better-auth.com/docs (Prisma adapter, Next.js handler `toNextJsHandler`, rate limit, session config).
**Database:** Prisma — https://www.prisma.io/docs/orm/overview/databases/neon (driver adapters, pooled vs direct) · Neon branching https://neon.com/docs/introduction/branching · Neon Object Storage https://neon.com/docs/storage/overview (presign, S3 API support matrix, limits).
**Realtime:** LiveKit — https://docs.livekit.io/home/quickstart (JS SDK, components-react) · token auth https://docs.livekit.io/home/client/token-auth · server API (mute/kick) https://docs.livekit.io/reference/server-api · quotas §3 above.
**STT:** Groq — https://console.groq.com/docs/speech-to-text (model ids, `verbose_json`, file caps) · rate limits §3 above.
**Storage SDK:** AWS S3 presigner — https://sdk.aws.com/sdk-for-javascript/v3/client/s3 (PutObject/UploadPart/CompleteMultipart + `getSignedUrl`).
**Redis:** Upstash — https://upstash.com/docs (Redis REST, `@upstash/ratelimit` sliding window).
**Web Audio:** MDN AudioWorklet https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet · `getUserMedia` constraints (echoCancellation etc.) https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia · MediaRecorder https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder.
**Vercel:** limits https://vercel.com/docs/limits · env https://vercel.com/docs/environment-variables.

## 9. Phase status (update this table when a phase exits)

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Engineering doc set | ✅ |
| 1 | Scaffold + deps + `.env.example` + docs | ✅ |
| 2 | Auth + Prisma schema on Neon | ✅ verified (sign-up → sign-in → get-session → cleanup) |
| 3 | Rooms + LiveKit tokens (role claims) | ✅ verified (create → admit → token → draft→live) |
| 4 | Studio UI (design-spec states) | ⬜ |
| 5 | STT pipeline (VAD → Groq → DataChannel) | ⬜ |
| 6 | Recording (multipart → playback) | ⬜ |
| 7 | Quota guards + ratelimits + polish | ⬜ |
| 8 | Tests + CI + demo GIF | ⬜ |

**Definition of Done:** [`code-complexity-and-quality.md` §8](./docs/code-complexity-and-quality.md) · **Agent workflow:** [`subagent-team.md`](./docs/subagent-team.md) · **Phase 2 kickoff:** schema per `database-and-security.md` §2, Better Auth per §3.
