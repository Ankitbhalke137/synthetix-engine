# Git Flow — Synthetix Engine

**Model: trunk-based development** with short-lived branches. No `develop` branch, no long-lived release branches — a solo/agent-built showcase repo should optimize for a clean, reviewable history, not ceremony.

## Branch naming

| Pattern | Example | Purpose |
|---|---|---|
| `feat/<slug>` | `feat/studio-video-grid` | New behavior |
| `fix/<slug>` | `fix/token-expiry-reconnect` | Bug fixes |
| `docs/<slug>` | `docs/stt-chunk-math` | Doc-only changes |
| `chore/<slug>` | `chore/bump-deps` | Tooling, deps, config |
| `refactor/<slug>` | `refactor/extract-permission-matrix` | No behavior change |

Rules:
- **One concern per branch.** A branch that spans UI + schema + docs for three features gets split.
- Branches are **short-lived** (< 2 days of work). Anything longer becomes a stack of PRs.
- Delete the branch after merge (squash).

## The Neon preview-branch trick (part of the flow)

Every PR gets an isolated **Neon branch** (Postgres *and* Object Storage fork together), so integration work never touches shared state:

```bash
# per-PR database + storage branch (via Neon CLI or console)
neon branches create --name "pr-<number>"
```

| Environment | Neon branch | Storage bucket view | Vercel deployment |
|---|---|---|---|
| Local | `dev` | dev-only objects | `localhost:3000` |
| PR preview | `pr-<n>` (copy-on-write) | forked snapshot | Vercel preview URL |
| Production | `main` | production objects | Vercel production |

- PR branches are **disposable**: delete the Neon branch when the PR merges.
- Seed data and migrations run against `pr-<n>` only — never against `main` from a preview.
- Migrations land in the **same PR** as the code that needs them (see below).

## Commit convention — [Conventional Commits](https://www.conventionalcommits.org/)

```
<type>(<scope>): <imperative summary, ≤ 72 chars>

<body: why, not what — link the doc section if behavior changes>
```

Types used here: `feat` · `fix` · `docs` · `chore` · `refactor` · `test` · `perf`.

Scopes that matter: `auth`, `room`, `studio`, `stt`, `record`, `db`, `ci`, `docs`.

Examples:
```
feat(stt): VAD chunker with 8-12s target window
fix(record): resume multipart upload after 410 presign expiry
docs(arch): correct LiveKit free-tier numbers (5,000 participant-min)
```

## Merge rules

1. **Everything lands via PR** — including agent-authored changes. Direct pushes to `main` are for emergencies only (hotfixes get a retroactive PR).
2. **Squash merge.** `main` history = one commit per merged PR.
3. **CI must be green** (typecheck, lint, test, build) before merge — see [`code-complexity-and-quality.md`](./code-complexity-and-quality.md).
4. **Docs move with code.** A behavior change without a doc update in the same PR is incomplete (checklist enforces it).
5. **Schema changes:** the migration file and the matching `schema.prisma` diff must be in the PR; preview branch validates it before merge.
6. **No lockfile churn from unrelated installs** — regenerate `package-lock.json` only when dependencies actually change.

## Release flow

- `main` is always deployable. Vercel auto-deploys on merge (Git integration); the optional `Deploy` workflow does a CLI deploy after CI passes when `VERCEL_TOKEN` is configured — see [`ci-cd.md`](./ci-cd.md).
- Tag releases when a demo milestone is reached: `v0.1.0-auth`, `v0.2.0-studio`, `v0.3.0-captions`, `v1.0.0-demo`.
- A release = tag + GitHub Release with a 5-line changelog + demo GIF.
- Hotfix: branch from `main` → `fix/<slug>` → PR → merge → redeploy (same rules, no bypass).

## PR size & cadence

- Target **≤ 400 changed lines** per PR (excluding lockfiles/generated files). Split larger work — see [`pull-request-guidelines.md`](./pull-request-guidelines.md).
- Docs-only PRs are encouraged and cheap: they still get reviewed against [`AGENTS.md`](../AGENTS.md) facts (don't reintroduce corrected numbers).

## Branch protection (live: ruleset `main-protection`)

Configured on GitHub and enforced for `main`:

- [x] Require a pull request before merge (0 approvals — the checklist and CI are the gate)
- [x] Required status checks: **`quality`** and **`build`** (from `.github/workflows/ci.yml`)
- [x] Required linear history
- [x] No force-pushes / no branch deletion
- [x] **Squash merge only** (merge commits and rebase merges disabled)
- [x] Delete the branch after merge
- [x] Admin bypass reserved for emergencies (hotfixes still get a retroactive PR)

CI/CD details, secrets, and troubleshooting: [`ci-cd.md`](./ci-cd.md).
