# Code Complexity & Quality — Synthetix Engine

> What "done" means here: measurable complexity budgets, a test pyramid that runs offline, CI gates that block bad merges.
> Companion: [`pull-request-guidelines.md`](./pull-request-guidelines.md) · [`nextjs-conventions.md`](./nextjs-conventions.md)

---

## 1. Static standards

| Rule | Setting |
|---|---|
| TypeScript | `strict: true` (+ `noUncheckedIndexedAccess` recommended), zero `any`, zero `@ts-ignore` (use `@ts-expect-error` with a reason) |
| ESLint | `eslint-config-next` + flat config additions: `no-explicit-any: error`, `require-await: warn`, `prefer-const`, `no-floating-promises` (typescript-eslint) |
| Formatting | Prettier defaults (printWidth 100) — *add in Phase 2 with the lint PR* |
| Secrets | CI grep: fail if `GROQ_API_KEY|LIVEKIT_API_SECRET|DATABASE_URL` appears under `app/`/`components/` outside `lib/env` usage patterns |
| Deps | New dependency = justification comment in PR + note in [`architecture.md`](./architecture.md) ADR table if it changes the stack |

## 2. Complexity budgets (enforced by review, measurable via ESLint/max-lines)

| Metric | Budget | Action when exceeded |
|---|---|---|
| Function / action length | ≤ 50 lines | extract helper into `lib/` |
| Component render body | ≤ 150 lines | split presentational child |
| File length | ≤ 300 lines | split by responsibility |
| Cyclomatic complexity | ≤ 10 per function | early returns / table-driven branches |
| Nesting depth | ≤ 3 | invert guards (`if (!x) return`) |
| Prop count (component) | ≤ 8 | group into object / context |
| DRY trigger | 3rd duplicate → extract | — |
| `'use client'` boundary | ≤ 1 per leaf feature subtree | push state down |

Rationale: this app has genuinely hard parts (WebRTC state, VAD, multipart resume). Complexity budget is spent **there**, not in CRUD glue. Glue that needs high complexity is a design smell — see the ADR discipline.

## 3. Test strategy (offline & deterministic — never hit real vendors in CI)

| Layer | Tool | Scope | Target |
|---|---|---|---|
| Unit | **Vitest** | pure logic: `lib/audio/vad.ts`, `wav.ts`, caption `seq` dedupe, quota math, `permissions.ts` matrix, env schema | **≥ 80% of `lib/`** |
| Integration | Vitest + test Neon branch | Prisma queries (room lifecycle, transcript idempotency), Better Auth session flow, STT proxy authz with **mocked Groq** (MSW) | happy path + every 4xx branch |
| E2E smoke | **Playwright** (local, `next dev`) | login → create room → join → mocked caption renders → end → recording row exists | 1 flow, ≤ 3 min |
| Type | `tsc --noEmit` | whole repo | 0 errors |
| Visual (P1) | Playwright screenshots | design-spec states (grid, caption rail, quota modal) | 4 key states |

Rules:
- Tests live next to source (`vad.test.ts`) or `tests/` for integration/e2e.
- **Mock at the boundary:** Groq (MSW), LiveKit (fake token endpoint + loopback where possible), S3 (in-memory stub or LocalStack — P1; P0 tests presign authz logic only).
- Flaky test = quarantine + fix within the same PR; no `sleep`-based waits (use Playwright auto-waiting).
- CI runs unit + integration + typecheck + lint + build on every PR; e2e runs on `main` + nightly (documented in workflow).

## 4. CI pipeline (GitHub Actions — Phase 8)

Two required jobs run in parallel on every PR and every push to `main`:

```
quality:  checkout → setup-node → npm ci → prisma generate → prisma validate
          → lint → tsc --noEmit → vitest
build:    checkout → setup-node → npm ci → next build
```

- Concurrency: superseded runs on the same ref are cancelled.
- Node 20 (matches local) — the Vercel build is the production parity check.
- `prisma validate` + `prisma generate` catch schema changes without a migration.
- Safe placeholder env values keep forks and first-time contributors green
  without exposing secrets.
- Branch protection requires **`quality`** and **`build`**
  ([GITFLOW](./GITFLOW.md) §branch protection).
- Deploy runs only after `quality` + `build` succeed on `main`
  ([ci-cd.md](./ci-cd.md)).
- CodeQL runs on PRs/pushes and weekly; Dependabot opens weekly update PRs.
- Planned (not yet implemented): coverage artifacts, bundle-size comments,
  Playwright e2e on `main` + nightly.

## 5. Review checklist (human or Reviewer agent — applies to every PR)

- [ ] Follows [`nextjs-conventions.md`](./nextjs-conventions.md) (server-first, no secrets client-side)
- [ ] Authz on every new mutation/read path (RBAC doc matrix still accurate?)
- [ ] Complexity budgets respected (or budget change justified in PR)
- [ ] Tests added/updated for changed logic; mocked boundaries only
- [ ] Docs updated if behavior changed (README status table, pipeline doc, ADR if decision changed)
- [ ] No new dependency without justification
- [ ] Free-tier impact assessed (does this add Groq calls? participant-minutes? storage?)
- [ ] UI: design-spec states covered (loading/empty/error), keyboard + `aria-live` where applicable
- [ ] No `console.log`, no debug leftovers, no commented-out code

## 6. Performance budgets (CI-enforced)

| Budget | Threshold | Tool |
|---|---|---|
| Landing initial JS | ≤ 250 KB gzip | `next build` size report |
| Studio route initial JS | ≤ 350 KB gzip (LiveKit is the bulk) | bundle analyzer |
| LCP (landing) | ≤ 2.5 s on Slow 4G/Moto G | Lighthouse CI (P1) |
| CLS | ≤ 0.1 | Lighthouse CI (P1) |
| Main-thread long tasks during call | none > 50 ms from our code | worklet discipline (pipeline §3) |
| Caption p50 latency | ≤ 12 s | client telemetry log (demo metrics) |

## 7. Observability (free tier only)

- `lib/logger.ts`: structured JSON logs (`level`, `msg`, `roomId`, `requestId`) — **never** log audio bytes, transcript contents, tokens, or env values.
- Request id propagated: server action/route → log line → error toast ("error id").
- Errors: Sentry free tier *optional P1*; P0 = Vercel logs + `error.tsx` capture.
- Quota burn: counters in DB (chunks/day, participant-min month) — powers the BudgetChip, doubles as demo metrics.

## 8. Definition of Done (per feature)

1. Code + tests (per §3) green locally.
2. `npm run lint && npx tsc --noEmit && npm run build` green.
3. Docs touched wherever behavior/decisions changed (checklist in PR template).
4. New env vars → `.env.example` + `AGENTS.md` env table.
5. Complexity budgets hold.
6. Manual pass of the affected design-spec states (record a short screen recording for UI PRs).
7. PR follows [`pull-request-guidelines.md`](./pull-request-guidelines.md); squash-merged.

## 9. Anti-patterns (reject on sight)

- Fetching in `useEffect` what the server component can render.
- Authorization in the client only ("hidden button = denied").
- `any` at API boundaries instead of zod schemas.
- Storing presigned URLs / tokens in the DB or `localStorage`.
- Business logic inside `app/` route files beyond orchestration.
- Copy-paste across roles/permissions (use `lib/permissions.ts` single source).
- Vendor calls from client components (Groq/LiveKit server SDK/AWS SDK).
- Tests asserting mocks instead of behavior.
