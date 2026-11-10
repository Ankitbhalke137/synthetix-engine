# Database & Security — Synthetix Engine

> Schema is the source of truth for implementation (Phase 2). Auth/session hardening, API rules, storage security, and threat notes.
> Companion: [`rooms-roles-and-rbac.md`](./rooms-roles-and-rbac.md) (roles), [`realtime-media-pipeline.md`](./realtime-media-pipeline.md) (upload/authz flows).

---

## 1. Design rules

1. **Store keys, never URLs.** Presigned URLs expire (≤ 15 min); the DB holds `storageKey` + metadata; GET URLs are minted per request after authz.
2. **Every room-scoped query filters by membership** — no unscoped `findUnique` on user-supplied ids (IDOR is the top risk in this app).
3. **Indexes exist for every foreign key + every `orderBy`.** Postgres on 0.5 GiB still punishes seq-scans on transcript growth.
4. **Enums for state** (`RoomStatus`, `RecordingStatus`) — no free-text status.
5. **Cascades:** deleting a room removes participants/transcripts/recordings-metadata; storage objects cleaned by a P1 janitor (DB is authoritative for "what should exist").
6. **Migrations:** `prisma migrate dev` locally on the `dev` Neon branch; preview branches (`pr-<n>`) get `db push` (ephemeral); **production only via reviewed migration in the same PR** ([GITFLOW](./GITFLOW.md)).

## 2. Schema (Prisma — binding spec)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL") // pooled: ep-…-pooler (ADR-007)
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"] // verify against installed Prisma version
}

// ============ Better Auth models (unchanged from upstream docs) ============

model User {
  id            String    @id @default(uuid())
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  sessions      Session[]
  accounts      Account[]
  hostedRooms   Room[]    @relation("Host")
  memberships   RoomParticipant[]
}

model Session {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}

model Account {
  id                    String    @id @default(uuid())
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accountId             String
  providerId            String
  accessToken           String?
  refreshToken          String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?   // email/password (argon2 via Better Auth)
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([userId])
}

model Verification {
  id         String   @id @default(uuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime  @updatedAt
}

// ============ Synthetix application models ============

enum RoomStatus {
  draft     // created, not started
  live      // host opened the studio
  ended     // host ended — recording finalizing
  archived  // processed, playback available
}

enum ParticipantRole {
  host       // owner: full control incl. delete
  moderator  // mute/kick, cannot delete room
  participant // publish A/V, speak
  viewer     // subscribe only (P1 share links)
}

enum RecordingStatus {
  uploading  // parts in flight
  ready      // multipart complete, playable
  failed     // retries exhausted / host tab lost
  deleted    // soft-deleted, objects pending prune
}

model Room {
  id          String        @id @default(uuid())
  slug        String        @unique          // public join path /studio/[slug]
  name        String
  status      RoomStatus    @default(draft)
  hostId      String
  host        User          @relation("Host", fields: [hostId], references: [id], onDelete: Cascade)
  endedAt     DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  participants RoomParticipant[]
  transcripts  Transcript[]
  recordings   Recording[]
  auditEvents  AuditEvent[]

  @@index([hostId, createdAt])
  @@index([status])
}

model RoomParticipant {
  id           String          @id @default(uuid())
  roomId       String
  room         Room            @relation(fields: [roomId], references: [id], onDelete: Cascade)
  userId       String?         // null = guest with display name only (PRD Q1)
  user         User?           @relation(fields: [userId], references: [id], onDelete: SetNull)
  displayName  String
  role         ParticipantRole @default(participant)
  joinedAt     DateTime        @default(now())
  leftAt       DateTime?
  lastSeq      Int             @default(0)     // caption seq watermark per participant

  @@unique([roomId, userId])                   // one row per user per room
  @@index([roomId])
}

model Transcript {
  id        String   @id @default(uuid())
  roomId    String
  room      Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  seq       Int                                // monotonic per room (caption order)
  speakerId String?                            // RoomParticipant.id — attribution, not diarization
  speaker   String                            // display name at capture time (history-proof)
  text      String
  startMs   Int                                // media timeline (replay alignment)
  endMs     Int
  createdAt DateTime @default(now())

  @@unique([roomId, seq])                      // idempotent persists (retry-safe)
  @@index([roomId, startMs])
}

model Recording {
  id          String           @id @default(uuid())
  roomId      String
  room        Room             @relation(fields: [roomId], references: [id], onDelete: Cascade)
  storageKey  String           @unique          // rooms/{roomId}/recordings/{id}/… — NEVER a URL
  mimeType    String           @default("video/webm")
  sizeBytes   BigInt           @default(0)
  durationSec Float            @default(0)
  status      RecordingStatus  @default(uploading)
  partCount   Int              @default(0)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  @@index([roomId, createdAt])
  @@index([status])                             // janitor scans stuck uploads
}

model AuditEvent {
  id         String   @id @default(uuid())
  roomId     String
  room       Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  actorId    String?                             // null = system
  action     String                              // "mute" | "kick" | "end_room" | "delete_recording" …
  targetId   String?
  metadata   Json?
  createdAt  DateTime @default(now())

  @@index([roomId, createdAt])
}
```

### Why each change vs the original blueprint

| Change | Reason |
|---|---|
| Dropped `Recording.fileUrl` | Presigned URLs expire in minutes (errata #4) |
| Added `status`/`sizeBytes`/`mimeType`/`partCount` to Recording | Resumable uploads + janitor + playback allowlist need them |
| `Transcript`: `seq`, `startMs/endMs`, `speakerId`, `@@unique(roomId,seq)` | Ordered captions, replay alignment, idempotent retries |
| Added `RoomParticipant` | Membership is the authorization primitive (§5); roles live here |
| Added `Room.status` + `endedAt` | Lifecycle state machine (RBAC doc §4) |
| Added `AuditEvent` | Moderation accountability — interview-grade RBAC story |
| Indexes on every FK + hot `orderBy` | 0.5 GiB free tier, transcript growth |

## 3. Auth configuration (Better Auth)

```ts
// lib/auth.ts — spec (Phase 2)
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  session: {
    expiresIn: 60 * 60 * 24 * 7,       // 7 days
    updateAge: 60 * 60 * 24,           // rolling refresh
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  // socialProviders.github → P1 (PRD)
  rateLimit: { enabled: true, window: 10, max: 10 }, // login brute-force
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
});
```

Hardening rules:
- `BETTER_AUTH_SECRET` = ≥ 32 random bytes (`openssl rand -base64 32`); rotate on leak; never commit.
- Cookies: `httpOnly`, `sameSite=lax`, `secure` in prod (Better Auth defaults — verify in its docs at implementation time).
- Mounted at `app/api/auth/[...all]/route.ts` — the **only** auth entry point (no custom session logic anywhere else).
- Passwords hashed by Better Auth (argon2) — never roll your own hashing.

## 4. Secrets policy

| Rule | Detail |
|---|---|
| Server-only keys | `GROQ_API_KEY`, `LIVEKIT_API_SECRET`, Neon storage keys, `BETTER_AUTH_SECRET`, Upstash token — `process.env` on the server, **never** in `NEXT_PUBLIC_*`, never in logs/responses |
| Client-safe values | `NEXT_PUBLIC_LIVEKIT_URL`, app URL — nothing else |
| Validation | `lib/env.ts` parses `process.env` with zod at boot; missing var = loud crash at startup, not a 500 at runtime |
| Template | [`.env.example`](../.env.example) is committed; `.env.local` is gitignored (verify `.gitignore` covers it) |
| CI | secrets via GitHub Actions secrets; PRs from forks never receive them |

## 5. API security rules (every route handler / server action)

1. **Auth first:** `getSession()` → 401 before any work (except landing/marketing).
2. **Authz second:** ownership/membership predicate per resource (host-only actions require `role = host`).
3. **Validate input:** zod on body/query/params; reject unknown keys; size caps (STT chunk ≤ 2 MB).
4. **Rate-limit:** Upstash per-IP (auth routes: 10/min) and per-user (STT: 12/min) — [`realmedia…`] see pipeline §4.
5. **Method hygiene:** explicit `allow` lists; `POST` for mutations; CSRF handled by SameSite cookies + origin check for server actions.
6. **Errors:** uniform `{ error: { code, message } }`; no stack traces/SQL in prod responses.
7. **Never** trust DataChannel payloads for state changes — mutations re-enter through authenticated endpoints.

## 6. Object storage security

| Control | Setting |
|---|---|
| Bucket access | **private** — recordings never `public_read` |
| Upload authz | host-of-room only, room must be `live`, content-type allowlist (`video/webm`, `video/mp4`, `audio/webm`), ≤ 1 GB/room |
| Presign TTL | upload parts 15 min (re-signable); playback GET 5 min |
| Path isolation | keys namespaced by `roomId` — no cross-room guesses; UUIDs everywhere |
| Playback | membership check → presigned GET with Range support |
| Branch isolation | PR/preview Neon branches fork storage too — test uploads never touch prod objects |
| Lifecycle (P1) | abort stale multipart after 24 h; prune `deleted` recordings after 72 h |

## 7. Threat notes (what an interviewer will ask)

| Threat | Vector | Countermeasure |
|---|---|---|
| IDOR on transcripts/recordings | guessed UUIDs | membership predicate on every query (§5.2); UUIDs are not authorization |
| Presign abuse | leaked upload URL | short TTL + content-type/size constraints + host-only issuance |
| Key exfiltration | client bundle scan | server-only env vars; grep CI check for `GROQ_API_KEY` in `client components` |
| Session theft | XSS | httpOnly cookies + CSP headers (Next headers config) + no `dangerouslySetInnerHTML` |
| Login brute force | form spam | Better Auth rate limit + Upstash per-IP |
| Caption spoofing | peer data packets | render server-authored frames only, `seq` guard (pipeline §5) |
| Denial via quota burn | one user eats Groq budget | per-room daily counters + per-user STT ratelimit |
| Dependency supply chain | npm | lockfile committed; `npm audit` in CI; minimal dep set |
| Log leakage | debug logging audio/text | structured logs without payload contents; PII scrub rule |

## 8. Data retention (demo policy)

- **Transcripts:** kept while room exists (KB-scale); deleted with room (cascade).
- **Recordings:** until host deletes (soft-delete → 72 h prune, P1).
- **Audit events:** 90 days.
- **Sessions:** Better Auth expiry 7 days; no resurrection.
- **Deletion UX:** "Delete room" = confirm dialog → cascade DB + storage prefix delete (authz: host).

## 9. Verification checklist (Phase 2 exit)

- [ ] `prisma validate` + migration applies on `dev` branch
- [ ] Anonymous access to `/api/stt/*`, `/api/storage/*`, `/api/livekit/token` → 401
- [ ] Non-member room query → 403 (test both UUID formats)
- [ ] `grep -r "GROQ_API_KEY" app components` → server-only hits
- [ ] `.env.local` absent from `git status` after local run
- [ ] Login endpoint 10th rapid attempt → 429
