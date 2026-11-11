"use client";

import Link from "next/link";

import type { Role } from "@/lib/room-policy";
import { useStudioRoom, type StudioParticipant } from "./useStudioRoom";

const ROLE_LABEL: Record<Role, string> = {
  host: "Host",
  moderator: "Moderator",
  participant: "Participant",
  viewer: "Viewer",
};

const STATUS_COPY = {
  connecting: "Connecting…",
  connected: "Live",
  reconnecting: "Reconnecting…",
  error: "Not connected",
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function PresenceCard({ participant }: { participant: StudioParticipant }) {
  return (
    <li className="flex items-center gap-3 rounded-panel border border-border bg-surface p-4">
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-sm font-semibold"
      >
        {initials(participant.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {participant.name}
          {participant.isLocal ? <span className="text-text-muted"> (you)</span> : null}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          {participant.role ? `${ROLE_LABEL[participant.role]} · ` : null}
          Mic {participant.isMicrophoneEnabled ? "on" : "off"} · Camera{" "}
          {participant.isCameraEnabled ? "on" : "off"}
        </p>
      </div>
      {participant.isSpeaking ? (
        <span className="ml-auto font-mono text-[11px] tracking-[0.06em] text-ok uppercase">
          Speaking
        </span>
      ) : null}
    </li>
  );
}

export function StudioRoom({
  room,
  viewer,
}: {
  room: { slug: string; name: string };
  viewer: { name: string; role: Role };
}) {
  const { status, error, mediaBlocked, participants, retry, leave } = useStudioRoom(room.slug);

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
              <span className="text-text-muted">
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
          Camera or microphone access was blocked, so you joined without publishing. Allow access in
          your browser, then rejoin.
        </p>
      ) : null}

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
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
        ) : participants.length === 0 ? (
          <div className="grid h-full place-items-center">
            <p className="text-sm text-text-muted">
              {status === "reconnecting" ? "Reconnecting…" : "Connecting to the room…"}
            </p>
          </div>
        ) : (
          <section aria-label="People in this room" className="mx-auto max-w-3xl">
            <h2 className="text-xs font-semibold tracking-[0.06em] text-text-muted uppercase">
              In the room
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {participants.map((participant) => (
                <PresenceCard key={participant.identity} participant={participant} />
              ))}
            </ul>
            <p className="mt-6 text-sm text-text-muted">
              Video tiles, the control bar and the transcript rail arrive in the next slices.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
