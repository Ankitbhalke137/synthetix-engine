# Next.js Conventions — Synthetix Engine

> Rules for writing code **in this repo**. Framework version: **Next.js 16.4.6, React 19.3, Tailwind 4.3** — APIs may differ from your training data.

## ⚠️ Rule zero

> The scaffold's [`AGENTS.md`](../AGENTS.md) agent-rules block says it plainly: **read `node_modules/next/dist/docs/` (the guide for the feature you're touching) before writing any Next.js code.** Deprecation notices in local docs win over memory. This applies to humans' AI assistants too.

---

## 1. Project structure

```
synthetix-engine/
├── app/                      # App Router — routes only, no business logic
│   ├── (auth)/login/         # route groups for layout isolation
│   ├── (dashboard)/dashboard/
│   ├── studio/[roomSlug]/    # page.tsx + loading.tsx + error.tsx
│   ├── api/                  # route handlers (webhooks/SDKs/presign/STT)
│   │   ├── auth/[...all]/    # Better Auth catch-all — don't touch
│   │   ├── livekit/token/
│   │   ├── storage/presigned/
│   │   └── stt/transcribe/
│   ├── globals.css           # Tailwind v4 @theme tokens (NO tailwind.config.js)
│   ├── layout.tsx
│   └── page.tsx              # landing
├── components/
│   ├── studio/               # feature components (PascalCase.tsx)
│   └── ui/                   # primitives (button, dialog… — shadcn/Radix ok)
├── lib/                      # server + shared logic (camelCase.ts)
│   ├── auth.ts  auth-client.ts  env.ts  prisma.ts
│   ├── rooms.ts  permissions.ts  ratelimit.ts
│   ├── livekit.ts  neon-storage.ts  groq.ts
│   └── audio/ (vad.ts, wav.ts — pure, unit-tested)
├── prisma/schema.prisma
├── public/worklets/audio-processor.js
└── *.md                      # engineering docs (root — this doc set)
```

- **`app/` stays thin:** pages = parse params → call `lib/` → render. If a page exceeds ~80 lines of logic, the logic belongs in `lib/`.
- **Co-locate** route-level `loading.tsx` / `error.tsx` / `not-found.tsx` per route segment.
- **No barrel files** (`index.ts` re-exports) in `lib/` — explicit imports keep bundles honest.

## 2. Server vs client components

1. **Default: Server Component.** No `'use client'` until interactivity demands it.
2. `'use client'` is allowed for: event handlers, hooks, browser APIs (`getUserMedia`, `MediaRecorder`), LiveKit room components, worklet wiring.
3. **Never** in client components: `prisma`, `lib/auth.ts` (server), `@aws-sdk/*`, `process.env` secrets. Mark server-only modules with `import 'server-only'`.
4. Client components receive **serializable props only** (no Date? — Dates are fine in RSC props; functions/classes are not).
5. Push state down: container (server) → leaf (client) — avoid `'use client'` at route roots.

## 3. Mutations: server actions vs route handlers

| Use | When | Examples |
|---|---|---|
| **Server Action** | Same-app mutations from components, with revalidation | create room, end room, kick, delete recording |
| **Route Handler** (`app/api/**`) | External callers / SDKs / binary payloads | Better Auth, LiveKit token, presign URLs, STT proxy, webhooks |

Rules:
- Server actions: `'use server'` file (actions colocated in `app/studio/[roomSlug]/_actions.ts`), zod-parse `FormData`/args, authz inside the action (never rely on the caller), `revalidatePath` after success.
- Route handlers: export named verbs (`GET/POST/DELETE`), return `Response.json`, set explicit status codes (401/403/404/429 semantics in [`database-and-security.md`](./database-and-security.md) §5).
- **No mutations via `GET`.** No data fetching in `useEffect` when a server component can do it at render.

## 4. Data fetching & caching

- Server components: fetch directly from `lib/` (Prisma) — no `fetch` wrapper needed for own DB.
- Any `fetch()` to external APIs: set cache semantics explicitly (`cache: 'no-store'` for live data) — don't inherit defaults blindly (verify current defaults in local Next docs).
- After mutations: `revalidatePath('/dashboard')`, `revalidatePath('/studio/[slug]')`.
- Live data (captions, participants) flows via LiveKit, **not** polling and **not** RSC re-renders.
- Params/searchParams are `Promise` in Next 16 — `await` them (verify in local docs).

## 5. Route handlers — specifics

```ts
// app/api/stt/transcribe/route.ts — shape (spec)
import { auth } from '@/lib/auth';
export const runtime = 'nodejs';            // Prisma + AWS SDK are node-only
export const maxDuration = 30;              // STT passthrough budget — verify plan limit in local docs

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });  // verify API in Better Auth docs
  if (!session) return Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  // … zod parse → membership → ratelimit → Groq → broadcast → persist
}
```

- **Pick runtime deliberately:** `nodejs` default for Prisma/AWS SDK; `edge` only for pure-JS middleware-like work (Prisma does not run there).
- Never stream large bodies through handlers (uploads go presigned — ADR-005).
- Auth catch-all `app/api/auth/[...all]/route.ts` is generated glue — do not add custom logic there.

## 6. Environment variables

- `lib/env.ts` = single zod-validated access point (`export const env = EnvSchema.parse(process.env)`); import `env` instead of `process.env` in `lib/`.
- Naming: `NEXT_PUBLIC_*` **only** for `NEXT_PUBLIC_LIVEKIT_URL` + app URL. Everything else is server-only (see [`database-and-security.md`](./database-and-security.md) §4).
- `.env.example` updated in the **same PR** as any new var.

## 7. Styling (Tailwind v4)

- Tokens in `app/globals.css` `@theme` block ([`design-spec.md`](./design-spec.md) §2) — **there is no `tailwind.config.js`** (the original blueprint's layout is outdated — errata #6).
- Utility-first; custom classes only for true repeats (`@utility` when needed).
- No inline `style={{}}` except dynamic values (e.g., meter widths).
- Dark theme is the default (no `.dark` toggle until P1).

## 8. Forms & validation

- Client: react-hook-form or controlled state + zod schema from `lib/`.
- Server: re-validate with the **same** schema (never trust client validation).
- Errors render in-form (per-field), not toasts, for auth/room forms.

## 9. Types & naming

| Thing | Convention | Example |
|---|---|---|
| Components | PascalCase `.tsx` | `TranscriptPanel.tsx` |
| lib modules | camelCase `.ts` | `neon-storage.ts` |
| Server actions | verb phrases | `createRoom`, `endRoom` |
| Route segments | kebab/literal | `app/api/livekit/token` |
| Types | no `type` prefix; export from `lib/types.ts` or colocated | `CaptionFrame`, `RoomDTO` |
| Env vars | SCREAMING_SNAKE | `GROQ_API_KEY` |
| Prisma models | PascalCase singular | `RoomParticipant` |

- `strict` TypeScript is on; **no `any`** (eslint `@typescript-eslint/no-explicit-any` = error), no `as unknown as` casts — model API boundaries with zod schemas instead.
- Prisma-generated types are imported from `@prisma/client` — never hand-duplicate them; map to DTOs at the `lib/` boundary when the API shape differs from the table.

## 10. Errors, loading, empty

Per route segment, the triad is mandatory where user-facing:
- `loading.tsx` — skeletons matching [`design-spec.md`](./design-spec.md) §6 states.
- `error.tsx` — human copy + retry + error id; log server-side with context (no secrets, no payloads).
- Empty states — designed (`design-spec.md` §6 `idle`), never bare text.

Global: `app/not-found.tsx`, and a root `error.tsx` last resort. Never `console.log` in shipped code paths — use `lib/logger.ts` (structured, level-gated).

## 11. Metadata & SEO

- Root `layout.tsx`: title template (`%s · Synthetix Engine`), description, open-graph with eventual demo image.
- Per-route `generateMetadata` for studio/recording titles (room name only — no participant PII in titles).

## 12. Performance discipline

- Dynamic imports for heavy client islands (`MediaRecorder` UI, player) via `next/dynamic`.
- Images via `next/image`; no hero video on landing (GIF ≤ 15 s, compressed).
- Watch the studio route bundle: LiveKit SDK is the giant — keep it out of landing/dashboard routes (client component boundary at studio entry).
- Budgets enforced in CI: see [`code-complexity-and-quality.md`](./code-complexity-and-quality.md) §6.

## 13. Verification before you write Next.js code

1. Read the matching guide in `node_modules/next/dist/docs/`.
2. Check this doc + [`AGENTS.md`](../AGENTS.md) for repo rules.
3. If local docs contradict memory/training data → local docs win; note the discrepancy in the PR description.
