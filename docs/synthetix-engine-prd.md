# PRD — Synthetix Engine

**Version:** 0.1 · **Status:** Approved for planning · **Owner:** Ankit
**Related:** [`architecture.md`](./architecture.md) · [`design-spec.md`](./design-spec.md) · [`BLUEPRINT-ORIGINAL.md`](./BLUEPRINT-ORIGINAL.md) (raw idea, superseded)

---

## 1. Problem

Remote conversations (podcasts, interviews, standups, demos) need three things — multi-guest video, live captions, and a shareable recording — but:

- Meeting tools bury recordings behind paid tiers and don't export transcripts.
- Streaming stacks (RTMP + ffmpeg + SRT) are ops-heavy and cost money from minute one.
- Captions are either absent or delayed to the point of uselessness.

**Hypothesis:** a browser-only studio (no installs, no ffmpeg, no cloud encoding) can deliver *good enough* live captions + recordings for small sessions while costing **\$0/month** — if the architecture is designed around free-tier limits rather than ignoring them.

## 2. Target users (personas)

| Persona | Who | Needs | Success looks like |
|---|---|---|---|
| **Host** — "Priya" | Solo creator running a 2–4 guest interview | Start a room, invite by link, record, walk away with video + transcript | Room → recording in < 2 min of post-work |
| **Guest** — "Marcus" | First-time joiner, no account ideally | Join from laptop browser, mic/cam work, captions readable | Joined in < 15 s, zero install |
| **Reviewer** — the SDE interviewer | Scans repo for 3 minutes | Sees requirements → architecture → tradeoffs → quality gates | Finds ADRs, budget math, tests, CI |

## 3. Goals

| # | Goal | Measure |
|---|---|---|
| G1 | Real-time captions during a live room | Caption latency ≤ 12 s from speech (VAD chunk + Groq round-trip) |
| G2 | Recording + transcript available after the room | ≤ 30 s after last upload part (client-side finalize) |
| G3 | \$0 operating cost at demo scale | Vendor spend = \$0 across all five services |
| G4 | Zero-install guest experience | Chrome/Edge/Safari latest, no extensions |
| G5 | Honest quota behavior | Users see remaining budget before hitting a hard cap |
| G6 | Interview-grade engineering artifacts | Doc set + ADRs + tests + CI, per this repo |

## 4. Non-goals (explicitly out of scope)

- ❌ Mobile native apps (responsive web only)
- ❌ Paid-tier features: LiveKit Egress composites, stream import, phone/SIP
- ❌ Speaker diarization ML (Groq Whisper returns no speaker labels — we attribute via LiveKit identity + active-speaker detection, documented as a limitation)
- ❌ End-to-end encrypted rooms (SFU must read media to route it)
- ❌ Chat, reactions, polls, whiteboards (P3+ maybe)
- ❌ Multi-language UI (English only for demo)
- ❌ Scale beyond demo quotas — this is a **free-tier showcase**, not a business

## 5. Features

### P0 — must ship for the demo

| ID | Feature | Notes |
|---|---|---|
| P0-1 | Email/password auth (Better Auth) + sessions | GitHub OAuth deferred to P1 |
| P0-2 | Create room → shareable link (`/studio/[slug]`) | Host-only creation |
| P0-3 | Multi-guest WebRTC A/V via LiveKit (≤ 4 on screen) | Adaptive: 720p active speaker, 360p grid |
| P0-4 | Live captions from active speaker | VAD 8–12 s chunks → server Groq proxy → DataChannel |
| P0-5 | Transcript persistence + replay panel | Rows in Postgres, replay against recording timeline |
| P0-6 | Recording via `MediaRecorder` → presigned multipart upload | Direct-to-storage, bypasses Vercel bandwidth |
| P0-7 | Playback page for finished recordings | Authz'd presigned GET |
| P0-8 | Quota preflight + visible budget guard | Blocks start when session would exceed LiveKit cap |
| P0-9 | Basic moderation: host mute/kick/end | Enforced server-side (see RBAC doc) |

### P1 — post-demo

GitHub OAuth · viewer role + read-only share links · adaptive bitrate polish · transcript search/export (SRT/VTT) · Upstash retry queue for 429 backpressure · usage dashboard (quota burn-down) · Sentry/structured logs · 360p simulcast tuning.

### P2 — nice-to-have

Room scheduling · post-meeting AI summary (Groq chat model) · clip sharing · Noise suppression tuning presets · transcript redaction · public profile pages.

## 6. Constraints (the free tier *is* the spec)

| Constraint | Source | Product implication |
|---|---|---|
| 5,000 WebRTC participant-min/mo, 100 concurrent, 50 GB downstream — **hard caps** | [LiveKit quotas](https://docs.livekit.io/deploy/admin/quotas-and-limits/) | Preflight math before join; 360p for non-speakers; show budget in UI |
| Whisper: 20 RPM, 2,000 req/day, min 10 s billable, 28,800 audio-s/day | [Groq rate limits](https://console.groq.com/docs/rate-limits) | VAD chunking ≥ 8 s; active-speaker only; 429 → retry-after queue |
| 5 GB object storage/project, 0.5 GiB Postgres | Neon pricing | Retention policy (recordings pruned); transcripts are KBs |
| 100 GB Vercel bandwidth/mo | Vercel limits | Media never proxies through Vercel |
| 10k Upstash commands/day | Upstash free | Rate-limit checks only; queue is P1 |

## 7. Success metrics

| Metric | Target | How measured |
|---|---|---|
| Join → first caption | ≤ 15 s | Client timestamp diff |
| Caption latency (speech → display) | ≤ 12 s p50 | Worklet timestamp vs render |
| Room join success rate | ≥ 95% | Client telemetry log |
| Upload finalize success | ≥ 99% of parts | Recording status rows |
| Initial JS (studio route) | ≤ 350 KB gzip | Bundle analyzer in CI |
| Lighthouse (landing) | ≥ 90 | CI audit |
| Unit + integration coverage (lib/) | ≥ 80% | Vitest report in CI |
| Infra spend | \$0 | Vendor dashboards |

## 8. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LiveKit hard cap hit mid-demo | Rooms fail to open | P0-8 preflight; demo checklist resets monthly on day 1 |
| Groq 429 burst | Captions stall | Chunk sizing math + retry-after queue; captions degrade, A/V unaffected |
| Neon scale-to-zero cold start | Slow first query after idle | Pooled connection string; warm on deploy; keep handlers thin |
| Vercel function timeout on STT proxy | Lost caption chunk | Proxy = passthrough only (no processing); timeout budget documented |
| Presign expiry mid-upload | Corrupt recording | Multipart with per-part presigns; 410 → re-sign and resume |
| Safari `MediaRecorder`/codec gaps | No recording on Safari | MIME allowlist + graceful "recording unavailable" state |
| Free-tier terms change | Budget invalid | Limits cited with source + date in [`AGENTS.md`](../AGENTS.md); re-verify quarterly |

## 9. Open questions

1. Should guests be required to create accounts, or is link + display name enough for P0? *(leaning: display name, no account — fewer P0 auth edges)*
2. Recording retention: 30 days vs "delete when room deleted"? *(leaning: explicit delete button, no auto-prune in demo)*
3. Is caption display on-by-default, or opt-in to save downstream bandwidth? *(leaning: on, with toggle — bandwidth math tolerates it)*

## 10. Acceptance criteria for "demo-ready"

- [ ] Host creates room, 2 guests join from fresh browsers, all see/hear each other
- [ ] Captions appear for the active speaker with ≤ 12 s latency
- [ ] Host ends room → recording playable within 60 s, transcript attached
- [ ] Quota guard blocks a session that would exceed any free-tier cap
- [ ] CI green: typecheck + lint + tests + build
- [ ] README demo GIF ≤ 15 s showing the full loop
