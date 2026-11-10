# Subagent Team — Synthetix Engine

> How AI agents collaborate on this repo: roles, handoffs, and hard rules.
> The context every agent reads first: [`AGENTS.md`](../AGENTS.md). Humans follow the same rules.

---

## 1. Principles

1. **Docs first.** Change the doc → then the code. A feature PR whose governing doc doesn't exist (or disagrees) is incomplete.
2. **One writer at a time.** Agents never edit the same file concurrently; hand off with a written summary.
3. **Local docs beat memory.** Next.js APIs → `node_modules/next/dist/docs/`. Vendor limits → the verified table in `AGENTS.md` (re-verify with sources before changing).
4. **Small diffs.** PR size limits ([pull-request-guidelines](./pull-request-guidelines.md)) apply to agents — stack PRs.
5. **No silent scope.** Out-of-scope discoveries go into a `docs/findings-*.md` note or an issue, not into the current diff.

## 2. Roles

| Role | Owns | Reads before editing | Produces |
|---|---|---|---|
| **Architect** | `architecture.md`, ADRs, cross-cutting decisions | PRD + current ADRs + budget table | ADR PRs, decision diffs |
| **Scribe** | PRD, README, design-spec, doc consistency | all docs (consistency pass) | doc PRs, README status updates |
| **Data** | `prisma/schema.prisma`, `database-and-security.md`, `lib/prisma.ts`, `lib/neon-storage.ts` | schema rules §1–2, RBAC | migrations + integration tests |
| **Realtime** | `lib/audio/*`, worklet, `/api/stt/*`, LiveKit token, pipeline doc | realtime-media-pipeline (binding math) | STT/caption features + unit tests |
| **Web** | `app/**`, `components/**`, `design-spec.md` | design-spec + nextjs-conventions | UI features + Playwright smoke |
| **Platform** | auth wiring, `lib/ratelimit.ts`, `lib/env.ts`, CI workflows | database-and-security §3–5, quality doc | auth/CI PRs |
| **Reviewer** | enforces checklists; does not author feature code | PR guidelines + quality §5 | review comments, merge verdict |
| **QA** | test suites, mocks (MSW/Groq/LiveKit fakes), e2e | quality doc §3 | test PRs, flake quarantine |

A solo agent may *play* multiple roles sequentially — but the role boundaries still decide **which docs govern the change**.

## 3. Standard workflow (per feature, e.g. "P0-4 live captions")

```
1. Architect/Scribe   → confirm doc section exists & is current (or write it)      [docs PR]
2. Realtime           → implement worklet VAD + STT proxy + caption broadcast     [code PR]
3. QA                 → unit (VAD, seq) + integration (proxy authz, mocked Groq)  [test PR]
4. Reviewer           → checklist pass; verify free-tier math untouched            [review]
5. Scribe             → README status table + pipeline doc sync if drifted         [docs PR]
```

Each arrow is a **handoff packet** (see §5). Steps 2–3 may merge into one PR if ≤ 400 lines.

## 4. Hard rules (violations block merge)

1. Never move `GROQ_API_KEY` / `LIVEKIT_API_SECRET` / Neon credentials client-side.
2. Never store presigned URLs in the DB (`storageKey` only).
3. Never change chunk sizes/rate-limit numbers without updating the budget tables in `architecture.md` **and** `AGENTS.md` (they must stay identical — consistency is checked in review).
4. Never add a paid service or enable a paid plan feature.
5. Preserve the `<!-- BEGIN:nextjs-agent-rules -->` block in `AGENTS.md` untouched (Next.js regenerates it).
6. Never weaken a CI gate to make a PR green — fix the code or propose a gate change as its own PR.
7. Every new `process.env` var → `.env.example` + AGENTS env table in the same PR.
8. No `any`, no `console.log`, no commented-out code in shipped paths.

## 5. Handoff packet template

```markdown
## Handoff: <feature> → <next role>
- Branch/PR: <link>
- What changed: <files + 1-line each>
- Decisions made (or reconfirmed): <ADR refs>
- Decisions deferred: <list + where documented>
- Verified commands: <lint/tsc/test/build output summary>
- Risks for next agent: <e.g. "Safari MediaRecorder path untested">
- Docs updated: <files or "none — reason">
```

## 6. Context packets (what to include when spawning an agent)

Minimum viable context for any task in this repo:

1. The governing doc(s) from [`AGENTS.md`](../AGENTS.md) doc map (paste the relevant section, don't paraphrase).
2. Repo phase (see README status table) + the branch/PR in flight.
3. Budget facts if touching STT/realtime/storage (AGENTS verified-facts table).
4. Explicit out-of-scope list ("do not touch X").
5. Definition of Done link (quality §8).

For Next.js work: remind the agent of Rule zero (read `node_modules/next/dist/docs/` first).

## 7. Phase plan (who does what, in order)

| Phase | Owner roles | Exit criteria |
|---|---|---|
| 0 ✅ Docs | Architect + Scribe | full doc set reviewed against vendor sources |
| 1 ✅ Scaffold | Platform | `npm run dev` boots; deps installed; `.env.example` present |
| 2 Auth + schema | Platform + Data | login works on Neon `dev`; migrations applied; RBAC tests green |
| 3 Rooms + tokens | Data + Realtime | create/join room, LiveKit token issued w/ role claims |
| 4 Studio UI | Web | 2-browser local call with fake captions renders per design-spec |
| 5 STT pipeline | Realtime + QA | VAD → mocked Groq → DataChannel loop; real-Groq manual test |
| 6 Recording | Realtime + Data | multipart upload → `ready` row → playback page |
| 7 Quotas + polish | Platform + Web | BudgetChip, 429 path, error/empty states per design-spec |
| 8 CI + demo | QA + Scribe | green pipeline, demo GIF, README final |

## 8. Escalation (when an agent should stop and ask)

- A vendor limit in `AGENTS.md` seems wrong or outdated → stop, re-verify with source URL, PR the fact change (don't improvise numbers).
- A change would require an ADR reversal → Architect role first, docs PR, then code.
- Scope exceeds 400 lines → split proposal before writing more code.
- Two docs disagree → fix both in one docs PR; never pick silently.
