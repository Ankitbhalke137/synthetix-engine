"use client";

import type { StudioParticipant } from "./useStudioRoom";
import { avatarColor, initials } from "./avatar";
import { AttachedAudio, AttachedVideo } from "./MediaTrack";

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 3.2a2.1 2.1 0 0 0-2.1 2.1v3.2a2.1 2.1 0 1 0 4.2 0V5.3A2.1 2.1 0 0 0 10 3.2Z" />
      <path d="M5.9 9.4a4.1 4.1 0 0 0 8.2 0M10 13.5v3.2" />
      {muted ? <path d="M4.5 4.5l11 11" /> : null}
    </svg>
  );
}

export function ParticipantTile({
  participant,
  promoted,
  canModerate = false,
  moderationBusy = false,
  onMute,
  onKick,
}: {
  participant: StudioParticipant;
  promoted: boolean;
  /** Host/moderator controls for a remote, non-host participant. */
  canModerate?: boolean;
  moderationBusy?: boolean;
  onMute?: () => void;
  onKick?: () => void;
}) {
  const showVideo = participant.isCameraEnabled && participant.videoTrack !== null;

  return (
    <article
      aria-label={`${participant.name}${participant.isLocal ? " (you)" : ""} — microphone ${
        participant.isMicrophoneEnabled ? "on" : "muted"
      }, camera ${participant.isCameraEnabled ? "on" : "off"}`}
      className={`relative aspect-video overflow-hidden rounded-panel border border-border bg-black transition-shadow duration-150 ease-out ${
        participant.isSpeaking ? "shadow-[0_0_0_2px_var(--color-ok)]" : ""
      } ${promoted ? "sm:col-span-2" : ""}`}
    >
      {showVideo && participant.videoTrack ? (
        <AttachedVideo track={participant.videoTrack} mirrored={participant.isLocal} />
      ) : (
        <div className="grid h-full place-items-center">
          <span
            aria-hidden
            className="grid size-16 place-items-center rounded-full font-mono text-lg font-semibold text-text"
            style={{ backgroundColor: avatarColor(participant.identity) }}
          >
            {initials(participant.name)}
          </span>
        </div>
      )}

      {canModerate ? (
        <div className="absolute inset-x-0 top-0 flex items-center justify-end gap-1 bg-linear-to-b from-black/70 to-transparent px-2 pt-2 pb-6">
          <button
            type="button"
            onClick={onMute}
            disabled={moderationBusy}
            className="rounded-control border border-white/20 bg-black/40 px-2 py-1 text-[11px] font-semibold text-text transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mute
          </button>
          <button
            type="button"
            onClick={onKick}
            disabled={moderationBusy}
            className="rounded-control border border-danger/50 bg-danger/20 px-2 py-1 text-[11px] font-semibold text-danger transition-colors hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-linear-to-t from-black/80 to-transparent px-3 pt-8 pb-2.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-text">
            {participant.name}
            {participant.isLocal ? <span className="text-text-muted"> (you)</span> : null}
          </span>
          {participant.isSpeaking ? (
            <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-ok uppercase">
              Speaking
            </span>
          ) : null}
        </span>
        <span
          aria-hidden
          className={`shrink-0 rounded-control border p-1 ${
            participant.isMicrophoneEnabled
              ? "border-white/20 text-text"
              : "border-danger/50 bg-danger/20 text-danger"
          }`}
        >
          <MicIcon muted={!participant.isMicrophoneEnabled} />
        </span>
      </div>

      {!participant.isLocal && participant.audioTrack ? (
        <AttachedAudio track={participant.audioTrack} />
      ) : null}
    </article>
  );
}
