"use client";

import type { ReactNode } from "react";

function MicrophoneIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 3.2a2.1 2.1 0 0 0-2.1 2.1v3.2a2.1 2.1 0 1 0 4.2 0V5.3A2.1 2.1 0 0 0 10 3.2Z" />
      <path d="M5.9 9.4a4.1 4.1 0 0 0 8.2 0M10 13.5v3.2" />
      {muted ? <path d="M4.5 4.5l11 11" /> : null}
    </svg>
  );
}

function CameraIcon({ off }: { off: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="5.5" width="10" height="9" rx="2" />
      <path d="M12.5 8.5l5-2.5v8l-5-2.5" />
      {off ? <path d="M3.5 3.5l13 13" /> : null}
    </svg>
  );
}

function RecordIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.5 6.5V4.5a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-2" />
      <path d="M16.5 10H8M13.5 7l3 3-3 3" />
    </svg>
  );
}

function DeviceButton({
  label,
  shortcut,
  enabled,
  busy,
  disabled,
  onToggle,
  children,
}: {
  label: string;
  shortcut?: string;
  enabled: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-keyshortcuts={shortcut}
      aria-label={`${label}, currently ${enabled ? "on" : "off"}`}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onToggle}
      disabled={disabled || busy}
      className={`grid size-11 place-items-center rounded-control border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled
          ? "border-border bg-surface-2 text-text hover:border-accent"
          : "border-danger/40 bg-danger/15 text-danger"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * In-room controls. Record stays disabled until Phase 6 ships it — an honest
 * disabled control beats a button that silently does nothing.
 */
export function ControlBar({
  microphoneEnabled,
  cameraEnabled,
  captionsEnabled,
  busy,
  disabled,
  onToggleMicrophone,
  onToggleCamera,
  onToggleCaptions,
  onLeave,
}: {
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  captionsEnabled: boolean;
  busy: boolean;
  disabled: boolean;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onToggleCaptions: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2">
      <DeviceButton
        label="Toggle microphone"
        shortcut="M"
        enabled={microphoneEnabled}
        busy={busy}
        disabled={disabled}
        onToggle={onToggleMicrophone}
      >
        <MicrophoneIcon muted={!microphoneEnabled} />
      </DeviceButton>

      <DeviceButton
        label="Toggle camera"
        enabled={cameraEnabled}
        busy={busy}
        disabled={disabled}
        onToggle={onToggleCamera}
      >
        <CameraIcon off={!cameraEnabled} />
      </DeviceButton>

      <button
        type="button"
        aria-pressed={captionsEnabled}
        aria-keyshortcuts="C"
        aria-label={`Toggle captions, currently ${captionsEnabled ? "open" : "closed"}`}
        title="Captions (C)"
        onClick={onToggleCaptions}
        disabled={disabled}
        className={`grid size-11 place-items-center rounded-control border font-mono text-[11px] font-semibold tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          captionsEnabled
            ? "border-accent bg-accent/15 text-accent"
            : "border-border bg-surface-2 text-text-muted hover:border-accent hover:text-text"
        }`}
      >
        CC
      </button>

      <span aria-hidden className="mx-1 h-6 w-px bg-border" />

      <button
        type="button"
        disabled
        title="Recording ships with the recording phase"
        aria-label="Record, not available yet"
        className="grid size-11 place-items-center rounded-control border border-border bg-surface-2 text-text-muted opacity-50"
      >
        <RecordIcon />
      </button>

      <button
        type="button"
        onClick={onLeave}
        className="ml-1 flex h-11 items-center gap-2 rounded-control bg-danger px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        <LeaveIcon />
        Leave
      </button>
    </div>
  );
}
