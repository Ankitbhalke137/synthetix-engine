# Pull Request Guidelines — Synthetix Engine

> Small, reviewable, documented PRs. Same rules for humans and AI agents — no exceptions for "just a quick change".

---

## 1. Before you open

- Branch from updated `main` ([GITFLOW](./GITFLOW.md) naming: `feat|fix|docs|chore|refactor/<slug>`).
- Self-review the diff first — you are the first reviewer.
- CI green locally: `npm run lint && npx tsc --noEmit && npm test && npm run build`.

## 2. Size limits

| Limit | Value | If exceeded |
|---|---|---|
| Changed lines (excl. lockfiles, generated, snapshots) | **≤ 400** | split into stacked PRs (base → follow-up, each green) |
| Files touched | ≤ 15 | strong signal of a grab-bag PR |
| Concerns | **exactly 1** | split; "chore: updates" PRs are rejected |
| New dependencies | ≤ 1 per PR | justify in description |

Docs-only PRs are exempt from size limits but not from accuracy review (don't regress corrected facts).

## 3. Title & description

**Title:** Conventional Commits, imperative, ≤ 72 chars.
```
feat(stt): VAD chunker with 8-12s target window
fix(record): resume multipart upload after presign expiry
docs(arch): correct LiveKit free-tier participant minutes
```

**Description template:**

```markdown
## What
<2-4 bullets: the change>

## Why
<problem/decision link — cite the doc section, e.g. "ADR-003" / "PRD P0-4">

## How tested
<unit/integration/e2e/manual — exact commands or steps>

## Docs
- [ ] Docs updated (list files) / N/A — doc-only PR
- [ ] Schema/env changes reflected (migration + .env.example)

## Free-tier impact
<none | +N Groq req/day | +M participant-min | +KB storage>

## Screenshots / recording
<required for UI changes: before → after, or 5-10 s clip>
```

## 4. Merge checklist (reviewer verifies)

- [ ] CI checks pass (typecheck, lint, test, build)
- [ ] Follows [`code-complexity-and-quality.md`](./code-complexity-and-quality.md) §5 review checklist
- [ ] Authz considered for new endpoints (RBAC matrix unchanged or updated)
- [ ] No secrets, no `console.log`, no dead code, no unrelated reformatting
- [ ] Tests cover the changed behavior (not just mocks)
- [ ] Docs moved with behavior (README status table if phase status changed)
- [ ] Resolved all conversations
- [ ] Conventional title, reasonable size

## 5. Merge policy

- **Squash merge only**; title = final conventional commit.
- Delete the branch on merge; delete the Neon `pr-<n>` branch too.
- `main` is protected: no direct pushes (hotfixes still get a retroactive PR).
- One approval minimum (self-approve allowed for solo work **after** a cooldown re-read — the checklist is the real gate; for agent PRs, the Reviewer agent in [`subagent-team.md`](./subagent-team.md) reviews).
- Rebase-merge discouraged (history noise); merge commits never (squash).

## 6. Review etiquette

- Review the **code and docs**, not the author.
- Blockers = correctness/security/complexity-budget violations. Style nits → "non-blocking".
- Every blocking comment cites the rule (doc section) — "this violates RBAC §3 Layer 1" not "this seems wrong".
- Respond to comments with code change or reasoned disagreement; unresolved threads block merge.
- Max review latency target: same day (solo) — PRs older than 48 h get rebased or split.

## 7. Agent-authored PRs (additional rules)

1. Include the **verification evidence** (command output summary) in "How tested".
2. List every file the agent touched beyond the diff (e.g., doc updates) — no silent scope expansion.
3. If local Next.js docs contradicted training data, note it in the description (conventions §13).
4. Never mark "Docs updated" unless the doc diff is actually in the PR.
5. Stack PRs rather than exceeding size limits; reference the base PR.

## 8. What gets rejected

- PRs that mix refactors with behavior changes.
- "Fix lint" commits that silence rules instead of fixing code.
- Generated-file churn (`package-lock.json` without dep changes, `.next/`, `node_modules`).
- Behavior changes without doc updates, or doc updates that restate outdated facts (see README errata).
- Any PR that moves a Groq/LiveKit call client-side or stores a presigned URL in the DB.
