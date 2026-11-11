# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `main` (latest) | ✅ |
| Older commits / tags | ❌ |

The project is a free-tier showcase; security fixes land on `main` and are
deployed there.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately using one of these channels:

1. **GitHub private vulnerability reporting** (preferred):
   [Security → Report a vulnerability](https://github.com/Ankitbhalke137/synthetix-engine/security/advisories/new)
2. Email **bhalkeankit@gmail.com** with the subject `SECURITY: synthetix-engine`.

Please include:

- A description of the issue and its impact.
- Reproduction steps or a proof of concept.
- Affected route/file and, if known, the commit SHA.
- Any suggested fix.

**Never include real credentials, API keys, session tokens, or personal data in a
report.** Redact them.

## What to expect

| Stage | Target |
|---|---|
| Acknowledgement | within 72 hours |
| Triage and severity assessment | within 5 business days |
| Fix or mitigation | depends on severity; coordinated with you |
| Public disclosure | after a fix ships, with credit if you want it |

We follow coordinated disclosure and will credit reporters in the advisory
unless you ask us not to.

## In scope

- Authentication and session handling (Better Auth configuration, cookies).
- Authorization gaps: room access, participant roles, token minting.
- Server-side request handling: `/api/stt/transcribe`, `/api/livekit/token`,
  `/api/preflight/[roomId]`, `/api/storage/*`, `/api/recordings`.
- Secret leakage into client bundles, logs, or API responses.
- Presigned URL misuse or stored-URL replay.
- Injection, SSRF, or unsafe deserialization in server code.
- Dependency vulnerabilities with a reachable exploit path.

## Out of scope

- Denial of service against free-tier quotas by design (the app intentionally
  rate-limits and shows budget guards).
- Missing security headers that have no demonstrated impact.
- Reports requiring a compromised browser, compromised device, or physical
  access.
- Social engineering of maintainers.
- Automated scanner output without a reproducible impact.

## Security design rules (for contributors)

These are enforced in review and in [`AGENTS.md`](../AGENTS.md):

1. Secrets are **server-only**. Never in client components, `NEXT_PUBLIC_*`,
   logs, or responses.
2. Vendors (Groq, LiveKit server SDK, AWS SDK) are called **only** from server
   handlers — never the browser.
3. Presigned URLs are **never persisted**; store the object key and sign on read
   after authorization.
4. Authorization is **re-derived from the database** on every room-scoped
   request. Client claims are never trusted.
5. Sessions use `httpOnly`, `secure`, `sameSite` cookies; `BETTER_AUTH_SECRET`
   is ≥ 32 random bytes and rotated on leak.
6. Rate limits and quota guards fail closed for costly operations and fail open
   only where a vendor outage should not take the whole app down (documented in
   `lib/quota.ts`).

## Dependency and secret hygiene

- Dependabot opens weekly PRs for npm and GitHub Actions updates.
- CodeQL scans JavaScript/TypeScript on every push and PR to `main`.
- If you suspect a secret was committed, **rotate it first**, then tell the
  maintainer — history rewriting alone is not a fix.
