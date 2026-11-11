# Contributing to Synthetix Engine

First off — thank you. This project exists to show what a small, well-documented
team (or one engineer) can build on free tiers, and contributions that respect
its constraints make it better for everyone.

This guide covers everything you need: setup, conventions, quality gates, and
how a change travels from an idea to `main`.

- [Code of Conduct](./CODE_OF_CONDUCT.md) — expected behavior, enforced.
- [Security policy](./SECURITY.md) — report vulnerabilities privately.
- [PR guidelines](./pull-request-guidelines.md) — the detailed review checklist.
- [Git flow](./GITFLOW.md) — branching, commits, merges.
- [CI/CD](./ci-cd.md) — what runs and why.

---

## 1. Ways to contribute

| You want to… | Do this |
|---|---|
| Report a bug | Open a [bug report](https://github.com/Ankitbhalke137/synthetix-engine/issues/new?template=bug_report.yml) |
| Suggest a feature | Open a [feature request](https://github.com/Ankitbhalke137/synthetix-engine/issues/new?template=feature_request.yml) — check the PRD non-goals first |
| Fix a bug / build a feature | Comment on the issue, then open a PR |
| Improve docs | Docs-only PRs are welcome and exempt from the size limit |
| Improve tests or CI | Very welcome — see [CI/CD](./ci-cd.md) |
| Report a vulnerability | **Privately** via [Security](./SECURITY.md) — never a public issue |

New here? Look for issues labelled **`good first issue`** or **`help wanted`**.

---

## 2. Development setup

### Prerequisites

- **Node.js 20.9+** (Node 22 LTS also works and matches Vercel builds)
- **npm** (the repo commits `package-lock.json` — do not switch package managers)
- Free-tier accounts (all optional for docs/test-only work):
  [Neon](https://neon.com) · [LiveKit Cloud](https://livekit.io) ·
  [Groq](https://console.groq.com) · [Upstash](https://upstash.com) ·
  [Vercel](https://vercel.com)

### Steps

```bash
# 1. Fork the repository on GitHub, then clone your fork
git clone https://github.com/<your-username>/synthetix-engine.git
cd synthetix-engine

# 2. Add the upstream remote
git remote add upstream https://github.com/Ankitbhalke137/synthetix-engine.git

# 3. Install exactly what the lockfile pins
npm ci

# 4. Create your environment file
cp .env.example .env.local
#    Fill in DATABASE_URL (pooled), BETTER_AUTH_SECRET, LiveKit, Groq,
#    Neon Storage, and Upstash values. See docs/ci-cd.md §5 for descriptions.

# 5. Generate the Prisma client and apply migrations to *your* Neon branch
npx prisma generate
npm run db:migrate

# 6. Start the dev server
npm run dev          # http://localhost:3000
```

> **Port matters.** Better Auth validates the request origin against
> `BETTER_AUTH_URL`. If port 3000 is busy and you run `npm run dev -- -p 3001`,
> also set `BETTER_AUTH_URL=http://localhost:3001` or sign-in fails with
> “Invalid origin”.

### Working without cloud credentials

You do **not** need real credentials to work on docs, pure logic, or tests:

- `npm test`, `npm run lint`, and `npm run typecheck` run fully offline.
- `npm run build` uses lazy singletons, so it succeeds without secrets.
- Routes that call vendors return `503` when their key is missing — expected.

---

## 3. Branch, commit, and PR conventions

### Branch names

```
feat/<slug>       new behavior           feat/studio-video-grid
fix/<slug>        bug fix                fix/token-expiry-reconnect
docs/<slug>       documentation          docs/stt-chunk-math
chore/<slug>      tooling / config       chore/bump-deps
refactor/<slug>   no behavior change     refactor/extract-permission-matrix
```

One concern per branch. Branches should live for hours or a couple of days, not
weeks — split large work into stacked PRs.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), imperative mood,
≤ 72 characters in the subject:

```
feat(stt): VAD chunker with 8-12s target window
fix(record): resume multipart upload after 410 presign expiry
docs(arch): correct LiveKit free-tier participant minutes
```

Useful scopes: `auth`, `room`, `studio`, `stt`, `record`, `db`, `ci`, `docs`.

### Pull requests

1. Branch from an up-to-date `main`.
2. Keep the diff **≤ 400 changed lines** (excluding lockfiles/generated files)
   and **one concern** per PR. Split larger changes.
3. Fill in the PR template — the “How tested” and “Docs” sections are required.
4. Move docs with the code: a behavior change without a doc update is
   incomplete. Schema changes include the migration in the same PR.
5. Make sure CI is green. `main` is protected: **squash merge only**, linear
   history, no force-pushes, no branch deletion.
6. Delete your branch after merge.

---

## 4. Quality gates (run these before pushing)

```bash
npm run lint          # ESLint (no warnings allowed in changed files)
npm run typecheck     # next typegen + TypeScript strict
npm test              # Vitest — currently 70 tests
npm run build         # Next.js production build
```

CI runs the same four gates (plus Prisma validation) in two jobs: `quality` and
`build`. Both are required status checks on `main`. If a gate fails, the PR
cannot merge — fix the cause, do not bypass.

### What reviewers look for

- Correctness, security, and honest failure states.
- Authorization re-derived server-side — never trusted from the client.
- No secrets in client code, logs, or API responses.
- Tests for the changed behavior, not just mocks of it.
- Docs and `.env.example` updated with the code.
- No `any`, `console.log`, or commented-out code in shipped paths.
- Free-tier impact stated (vendor requests, storage, participant minutes).

The full checklist lives in [pull-request-guidelines.md](./pull-request-guidelines.md).

---

## 5. Project rules that are easy to miss

These come from [`AGENTS.md`](../AGENTS.md) and are binding:

1. **Docs first.** If a feature is not in the PRD, discuss it in an issue first.
2. **Never** put secrets in client code, `NEXT_PUBLIC_*`, logs, or responses.
3. **Never** call Groq / LiveKit-server / AWS SDK from the browser — route
   through a server handler.
4. **Never store presigned URLs** — store the object key and sign on read after
   authorization.
5. **Never trust the client for authorization** — every room-scoped read or
   mutation filters by membership and role server-side.
6. **Do not change free-tier numbers from memory.** They are cited and verified
   in `AGENTS.md` §3; re-check the vendor source before editing.
7. **No new dependencies without justification**, and no paid services — ever.

---

## 6. Database changes

- Edit `prisma/schema.prisma`, then run `npm run db:migrate` against **your own**
  Neon branch to generate a migration.
- Commit both the schema diff and `prisma/migrations/**`.
- Never run migrations against production from a preview branch.
- Test the migration on a fresh Neon branch before opening the PR.

Regenerate the client after schema edits with `npx prisma generate` (also runs
automatically on `npm ci`).

---

## 7. Getting unstuck

| Symptom | Fix |
|---|---|
| `Invalid origin` on sign-in | Access the app at exactly `BETTER_AUTH_URL` (scheme, host, port) |
| `P1001: Can't reach database server` | Use the **pooled** `DATABASE_URL`; check the Neon project is awake |
| Prisma client missing | `npx prisma generate` |
| Build behaves differently from Vercel | Use Node 20+, `npm ci`, and no extra env beyond `.env.example` |
| Tests fail after pulling | `npm ci` then `npm test` — do not reuse stale `node_modules` |

Still stuck? Open a question in
[Discussions](https://github.com/Ankitbhalke137/synthetix-engine/discussions)
or comment on the relevant issue.

---

## 8. Review and merge

- CI must be green before merge (required checks: `quality`, `build`).
- Squash merge only; the PR title becomes the commit subject.
- Reviewers cite the rule or doc section for blocking comments.
- Style nits are non-blocking unless they violate a documented quality budget.
- The maintainer aims to respond to PRs and issues within **72 hours**.

---

## 9. Recognition

Every merged contribution is credited in the PR and release notes. Thank you for
helping keep the project honest, small, and free.
