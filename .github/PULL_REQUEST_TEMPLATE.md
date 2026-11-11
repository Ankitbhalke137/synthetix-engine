<!--
Thanks for contributing to Synthetix Engine!

Please read docs/CONTRIBUTING.md and docs/pull-request-guidelines.md before
opening this PR. Keep it small (≤ 400 changed lines), one concern, and move the
docs with the code.
-->

## What

<!-- 2–4 bullets: what changed. -->

-

## Why

<!-- The problem or decision. Link the doc section, ADR, or issue. -->

-

Closes #

## How tested

<!-- Exact commands and/or manual steps. -->

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Manual check (describe):

## Docs

- [ ] Docs updated (list files) / N/A — doc-only PR
- [ ] `.env.example` updated if a new environment variable was added
- [ ] Prisma migration included if the schema changed

## Free-tier impact

<!-- none | +N Groq req/day | +M participant-min | +KB storage -->

none

## Screenshots / recording

<!-- Required for UI changes: before → after, or a short clip. -->

## Checklist

- [ ] One concern per PR; ≤ 400 changed lines (excluding lockfiles/generated)
- [ ] Conventional Commit title (`feat(scope): …`)
- [ ] No secrets, `console.log`, or commented-out code
- [ ] Authorization considered for new routes (RBAC matrix unchanged or updated)
- [ ] Tests cover the changed behavior
- [ ] Branch is up to date with `main`
