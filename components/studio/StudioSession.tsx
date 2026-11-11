"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Role } from "@/lib/room-policy";
import { ControlBar } from "./ControlBar";
import { ROLE_LABEL } from "./labels";
import { TranscriptRail } from "./TranscriptRail";
import { useStudioRoom, type StudioPreferences } from "./useStudioRoom";
import { VideoGrid } from "./VideoGrid";

const STATUS_COPY = {
  connecting: "Connecting…",
  connected: "Live",
  reconnecting: "Reconnecting…",
  error: "Not connected",
} as const;

const TRANSCRIPT_KEY = "synthetix:transcript-open";

export function StudioSession({
  room,
  viewer,
  preferences,
}: {
  room: { slug: string; name: string };
  viewer: { name: string; role: Role };
  preferences: StudioPreferences;
}) {
  const {
    status,
    error,
    mediaBlocked,
    mediaBusy,
    participants,
    activeSpeaker,
    retry,
    leave,
    toggleMicrophone,
    toggleCamera,
  } = useStudioRoom(room.slug, preferences);

  const local = participants.find((participant) => participant.isLocal);
  const microphoneEnabled = local?.isMicrophoneEnabled ?? false;
  const cameraEnabled = local?.isCameraEnabled ?? false;

  // Default open on desktop, closed on small screens unless the guest chose.
  const [captionsOpen, setCaptionsOpen] = useState(() => {
    if (typeof window === "undefined") return false;

    const stored = window.localStorage.getItem(TRANSCRIPT_KEY);
    if (stored) return stored === "open";

    return window.matchMedia("(min-width: 1024px)").matches;
  });

  useEffect(() => {
    window.localStorage.setItem(TRANSCRIPT_KEY, captionsOpen ? "open" : "closed");
  }, [captionsOpen]);

  // M toggles the mic, C the caption rail, Esc closes the mobile sheet.
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

      if (typing) return;

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        toggleMicrophone();
      } else if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        setCaptionsOpen((current) => !current);
      } else if (event.key === "Escape") {
        setCaptionsOpen(false);
      }
    }

    window.addEventListener("keydown", handleShortcut);

    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, [toggleMicrophone]);

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="shrink-0 text-sm font-semibold tracking-tight hover:text-accent"
          >
            Synthetix Engine
          </Link>
          <span aria-hidden className="text-border">
            /
          </span>
          <h1 className="truncate text-sm font-medium">{room.name}</h1>
          <span className="shrink-0 rounded-control border border-border px-2 py-0.5 font-mono text-[11px] tracking-[0.06em] text-text-muted uppercase">
            {ROLE_LABEL[viewer.role]}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] uppercase">
            {status === "connected" ? (
              <span aria-hidden className="size-1.5 rounded-full bg-live" />
            ) : null}
            <span className={status === "reconnecting" ? "text-accent" : "text-text-muted"}>
              {STATUS_COPY[status]}
            </span>
            {status === "connected" ? (
              <span className="text-text-muted" aria-live="polite">
                · {participants.length} {participants.length === 1 ? "person" : "people"}
              </span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={() => void leave()}
            className="rounded-control border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-danger hover:text-danger"
          >
            Leave
          </button>
        </div>
      </header>

      {status === "reconnecting" ? (
        <p role="status" className="border-b border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent">
          Reconnecting — your media keeps trying.
        </p>
      ) : null}

      {mediaBlocked ? (
        <p role="status" className="border-b border-border bg-surface px-4 py-2 text-sm text-text-muted">
          Camera or microphone access was blocked. Allow access in your browser, then use the
          control again.
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {status === "error" ? (
            <div className="mx-auto mt-10 max-w-md rounded-panel border border-danger/40 bg-danger/10 p-6">
              <h2 className="text-lg font-semibold">Could not join the room</h2>
              <p className="mt-2 text-sm text-text-muted">{error}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
                >
                  Try again
                </button>
                <Link
                  href="/dashboard"
                  className="rounded-control border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent"
                >
                  Back to dashboard
                </Link>
              </div>
            </div>
          ) : (
            <VideoGrid participants={participants} activeSpeaker={activeSpeaker} status={status} />
          )}
        </main>

        {captionsOpen ? <TranscriptRail onClose={() => setCaptionsOpen(false)} /> : null}
      </div>

      {status === "error" ? null : (
        <footer className="border-t border-border bg-surface px-4 py-3">
          <ControlBar
            microphoneEnabled={microphoneEnabled}
            cameraEnabled={cameraEnabled}
            captionsEnabled={captionsOpen}
            busy={mediaBusy}
            disabled={status !== "connected"}
            onToggleMicrophone={toggleMicrophone}
            onToggleCamera={toggleCamera}
            onToggleCaptions={() => setCaptionsOpen((current) => !current)}
            onLeave={() => void leave()}
          />
        </footer>
      )}
    </div>
  );
}
