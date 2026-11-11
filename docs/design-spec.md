# Design Spec — Synthetix Engine

> Visual + interaction contract for the studio and surrounding pages. Dark-first, caption-first, keyboard-friendly.
> Companion: [`synthetix-engine-prd.md`](./synthetix-engine-prd.md) (what) · [`nextjs-conventions.md`](./nextjs-conventions.md) (how it's built)

---

## 1. Design principles

1. **The call is the product.** Video grid dominates ≥ 70% of the viewport; chrome recedes.
2. **Captions are first-class UI**, not an overlay afterthought — dedicated rail with speaker attribution.
3. **Honest states.** Connecting / reconnecting / quota-blocked / permission-denied are designed, never blank screens.
4. **Zero-install friendliness.** Every control discoverable without docs; destructive actions confirmed.
5. **Dark by default** (video looks correct on dark), light theme P1.

## 2. Tokens (Tailwind v4 — configured in `app/globals.css` via `@theme`, **no** `tailwind.config.js`)

```css
@theme {
  /* color — engineer-dark palette */
  --color-bg:            oklch(0.16 0.01 260);   /* page */
  --color-surface:       oklch(0.21 0.012 260);  /* panels */
  --color-surface-2:     oklch(0.26 0.014 260);  /* hover/raised */
  --color-border:        oklch(0.32 0.012 260);
  --color-text:          oklch(0.95 0.005 260);
  --color-text-muted:    oklch(0.65 0.01 260);
  --color-accent:        oklch(0.72 0.17 45);    /* record/primary — amber */
  --color-live:          oklch(0.63 0.21 25);    /* REC dot — red */
  --color-ok:            oklch(0.7 0.17 150);
  --color-danger:        oklch(0.63 0.21 25);

  /* type */
  --font-sans:  ui-sans-serif, system-ui, …;
  --font-mono:  ui-monospace, …;                 /* transcript timestamps */

  /* motion */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 120ms;                        /* state changes ≤ 150ms */
  --duration-med:  240ms;                        /* panels/modals */

  /* radii / spacing scale */
  --radius-panel: 12px;  --radius-control: 999px;
}
```

Contrast: body text ≥ **7:1** on `bg`, muted ≥ **4.5:1**, caption text ≥ 4.5:1 over its scrim (WCAG AA minimum; target AA everywhere, AAA for captions).

## 3. Typography

| Role | Size / weight | Use |
|---|---|---|
| Display | 24–30 / 600 | Landing hero, room title |
| Title | 18 / 600 | Panels (Transcript, Settings) |
| Body | 14 / 400 (1.5) | UI copy, transcript lines |
| Caption small | **13 / 500 minimum** (captions never below 13 px) | live caption rail |
| Mono 12 | timestamps `00:04:12.480` | transcript markers |
| Overline 11 / 600 / tracking +0.06em | "LIVE", "REC", budget chip |

## 4. Layout

### 4.1 Studio (`/studio/[roomSlug]`) — desktop ≥ 1024 px

```
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR   room name · LIVE dot · budget chip · leave (⌘⇧Q)       │
├──────────────────────────────────────────────────┬───────────────┤
│                                                  │ TRANSCRIPT    │
│            VIDEO GRID (fluid, aspect-video)      │ rail 320–380px│
│            active speaker = large cell           │ ───────────── │
│            others = 360p thumbnails              │ live captions │
│                                                  │ + history     │
├──────────────────────────────────────────────────┴───────────────┤
│ CONTROL BAR  mic 🎤 · cam 📹 · level meter · captions CC ·        │
│             record ⏺ (host) · participants 4 · end (host)        │
└──────────────────────────────────────────────────────────────────┘
```

- Grid: 1 → 2×2 → 3×3 (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`), **active speaker promoted** to span-2 when ≥ 3 peers.
- Transcript rail: fixed right, collapsible (persist in `localStorage`); on < 1024 px becomes a bottom sheet (drag handle) — captions must never cover faces at any breakpoint.
- Control bar: fixed bottom, icon buttons ≥ 44×44 px touch targets, pill radius, `surface` + blur.

### 4.2 Other routes

| Route | Layout |
|---|---|
| `/` landing | centered hero + 3 feature cards + CTA "Create a room" (auth-gated) |
| `/login` | single card, 360 px, email/password; GitHub button P1 |
| `/dashboard` | list of host's rooms (status chips: draft/live/archived) + "New room" |
| `/studio/[slug]` | as above; pre-join device-check screen (mic/cam pickers, preview tile) |
| `/studio/[slug]/recording` | 16:9 player + transcript panel aligned to `startMs` (archived) |

## 5. Component inventory (maps to `components/studio/`)

| Component | Responsibility | Key states |
|---|---|---|
| `VideoGrid` | tiles, active-speaker promotion, 360p thumb switch | empty (no peers), connecting, 1–9 peers |
| `ParticipantTile` | video element, name chip, mute/pin badges, speaking ring | speaking, muted, camera-off (avatar), reconnecting |
| `ControlBar` | mic/cam/cc/record/end buttons + level meter | defaults, recording (red), disabled (no permission) |
| `LevelMeter` | RMS bars from worklet messages | idle/speaking (green→amber→red) |
| `TranscriptPanel` | live tail + history, speaker chips, timestamps, auto-scroll | empty, live, loading-more, error |
| `ParticipantsPopover` | list + host moderation menu | role icons, muted state |
| `BudgetChip` | remaining participant-min + caption quota | ok (< 60%), warning (≥ 60% burnt), blocked |
| `QuotaBanner` | persistent banner when captions disabled by quota | — |
| `PermissionGate` | mic/cam denied overlay with recovery steps | denied / device-lost |
| `PrejoinScreen` | device selection + preview + name | requesting, ready, denied |

## 6. State design (every screen defines these)

| State | Visual |
|---|---|
| `idle` | skeleton or illustrated empty ("No rooms yet — create one") |
| `connecting` | pulsing tile placeholders + "Connecting…" |
| `live` | LIVE dot (pulsing 2 s), active speaker ring |
| `reconnecting` | amber banner top: "Reconnecting — your media keeps trying" |
| `permission-denied` | full overlay with per-OS instructions + retry |
| `quota-blocked` | modal with budget math + reset date (never a silent failure) |
| `error` | human copy + retry button + copyable error id (no stack traces) |

Rules: no spinner without label > 300 ms; optimistic UI for local mute/cam only; server truth for everything else.

## 7. Motion

- State changes ≤ **150 ms**; panels/modals ≤ **240 ms**, `--ease-out`.
- LIVE/REC dot: opacity pulse only (no layout shift); respect `prefers-reduced-motion` (disable pulses).
- Caption entries: fade + 4 px rise (no typing effect — hurts readability/accessibility).
- Speaking ring: 120 ms scale on ring only, never the tile.

## 8. Accessibility (non-negotiable for the demo)

- **Keyboard:** every control tabbable in visual order; shortcuts: `M` mute, `C` captions, `P` pin, `Esc` close panels, `⌘⇧Q` leave (confirm).
- **Screen readers:** caption rail is `aria-live="polite"` (newest line announced, not whole history); participant list announces join/leave; buttons have accessible names ("Toggle microphone, currently on").
- **Focus:** visible 2 px accent ring on `:focus-visible`; modals trap focus and restore on close.
- **Captions:** ≥ 13 px, ≥ 4.5:1 contrast over `rgba(0,0,0,.72)` scrim, max ~60 chars/line, 2-line max.
- **Color independence:** LIVE/REC conveyed by dot **+** label, not color alone.

## 9. Responsive breakpoints

| Width | Behavior |
|---|---|
| ≥ 1280 | full studio: rail 380 px, 3×3 grid |
| 1024–1279 | rail 320 px, 2×2 grid |
| 768–1023 | transcript = bottom sheet, 2×2 grid |
| < 768 | single tile (active speaker), controls scrollable row, rail = full-screen sheet |

## 10. Assets & icons

- Icons: Lucide (tree-shaken, 16/20 px) — no emoji in shipped UI (emoji only OK in docs).
- Avatars: initials fallback on `surface-2` with deterministic hue from userId hash.
- No stock photos on landing — real product screenshot/GIF (Phase 8) in a browser frame.
- Empty-state illustrations: simple inline SVG (one weight, `text-muted`).

## 11. Implementation notes (Phase 4)

Where the shipped studio deliberately differs from the sketches above:

- **Icons are inline SVG**, not Lucide: no extra dependency, same 16/20 px stroke weight. Revisit if the icon set grows past the studio.
- **Transcript rail on < 1024 px** is a fixed bottom sheet that stops above the control bar, so mute/leave stay reachable; `Esc` and `Hide` close it. Desktop remains a 320–380 px docked rail and the preference persists in `localStorage`.
- **Record is rendered disabled** until the recording phase ships; it never pretends to work.
- **Captions rail ships ahead of captions** — the empty state explains the pipeline instead of showing fake lines. `aria-live="polite"` is already in place for Phase 5 entries.
- **Budget chip / quota banner** (Phase 7) and **participants popover** (moderation) are not in the Phase 4 studio yet.
- **Device selection** is on/off toggles in the pre-join screen; camera/mic *pickers* are P1.

