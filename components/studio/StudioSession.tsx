"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { CopyLinkButton } from "@/components/CopyLinkButton";
import {
  endRoomAction,
  kickParticipantAction,
  muteParticipantAction,
} from "@/app/actions/moderation";
import { can, type Role } from "@/lib/room-policy";
import { ControlBar } from "./ControlBar";
import { EndRoomButton } from "./EndRoomButton";
import { ROLE_LABEL } from "./labels";
import { TranscriptRail } from "./TranscriptRail";
import { useCaptionStream, type CaptionEntry } from "./useCaptionStream";
import { useRecording } from "./useRecording";
import { useStudioRoom, type StudioPreferences } from "./useStudioRoom";
import { VideoGrid } from "./VideoGrid";
import { BudgetChip } from "./BudgetChip";

const STATUS_COPY = {
  connecting: "Connecting…",
  connected: "Live",
  reconnecting: "Reconnecting…",
  error: "Not connected",
} as const;

const TRANSCRIPT_KEY = "synthetix:transcript-open";
const TRANSCRIPT_EVENT = "synthetix:transcript-change";

/**
 * The transcript rail preference is external state (localStorage + a media
 * query), so it is read through `useSyncExternalStore` rather than copied into
 * component state from an effect: the server snapshot stays "closed", the
 * client picks up the real preference after hydration, and other tabs stay in
 * sync via the storage event.
 */
function readCaptionsOpen(): boolean {
  const stored = window.localStorage.getItem(TRANSCRIPT_KEY);
  if (stored) return stored === "open";

  return window.matchMedia("(min-width: 1024px)").matches;
}

function subscribeCaptions(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(TRANSCRIPT_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(TRANSCRIPT_EVENT, onChange);
  };
}

function writeCaptionsOpen(open: boolean): void {
  window.localStorage.setItem(TRANSCRIPT_KEY, open ? "open" : "closed");
  window.dispatchEvent(new Event(TRANSCRIPT_EVENT));
}

export function StudioSession({
  room,
  viewer,
  preferences,
  guestDisplayName,
}: {
  room: { id: string; slug: string; name: string };
  viewer: { name: string; role: Role };
  preferences: StudioPreferences;
  guestDisplayName?: string;
}) {
  // Transcript entries: server-authored only, deduped by seq.
  const [entries, setEntries] = useState<CaptionEntry[]>([]);
  const lastSeqRef = useRef(-1);

  const addCaption = useCallback((entry: CaptionEntry) => {
    setEntries((current) => {
      if (entry.seq <= lastSeqRef.current) return current; // ignore duplicates
      lastSeqRef.current = entry.seq;
      return [...current, entry];
    });
  }, []);

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
  } = useStudioRoom(room.slug, preferences, addCaption, guestDisplayName);

  const local = participants.find((participant) => participant.isLocal);
  const microphoneEnabled = local?.isMicrophoneEnabled ?? false;
  const cameraEnabled = local?.isCameraEnabled ?? false;

  // Default open on desktop, closed on small screens unless the guest chose.
  const captionsOpen = useSyncExternalStore(
    subscribeCaptions,
    readCaptionsOpen,
    () => false, // server snapshot
  );

  const toggleCaptions = useCallback(() => {
    writeCaptionsOpen(!readCaptionsOpen());
  }, []);

  // Captions run only when the rail is open, the call is live and the local
  // mic is actually publishing. A muted guest must not be transcribed.
  const captionsActive = status === "connected" && captionsOpen && microphoneEnabled;

  // Start the caption stream (mic + VAD + STT proxy) while captions are active.
  useCaptionStream({
    roomId: room.id,
    audioTrack: local?.audioTrack?.mediaStreamTrack ?? null,
    enabled: captionsActive,
    onCaption: addCaption,
  });

  // Host-side recording: MediaRecorder → presigned parts → Neon Object Storage.
  const recording = useRecording({
    roomId: room.id,
    audioTrack: local?.audioTrack ?? null,
    videoTrack: local?.videoTrack ?? null,
    isHost: viewer.role === "host",
    isConnected: status === "connected",
  });

  const canModerate = can(viewer.role, "muteOthers");
  const canEndRoom = can(viewer.role, "endRoom");
  const { state: recordingState, stop: stopRecording } = recording;
  const [moderationPending, setModerationPending] = useState<string | null>(null);
  const [moderationError, setModerationError] = useState<string | null>(null);

  const handleMuteParticipant = useCallback(
    async (identity: string) => {
      setModerationPending(identity);
      setModerationError(null);

      try {
        const result = await muteParticipantAction(room.id, identity);

        if (!result.ok) setModerationError(result.error.message);
        else if (result.muted === false) {
          setModerationError("That participant has no live microphone to mute.");
        }
      } finally {
        setModerationPending(null);
      }
    },
    [room.id],
  );

  const handleKickParticipant = useCallback(
    async (identity: string) => {
      setModerationPending(identity);
      setModerationError(null);

      try {
        const result = await kickParticipantAction(room.id, identity);

        if (!result.ok) setModerationError(result.error.message);
      } finally {
        setModerationPending(null);
      }
    },
    [room.id],
  );

  const handleEndRoom = useCallback(async () => {
    // Finish the host's recording before the room disappears, otherwise the
    // multipart upload is abandoned. Failure must not block ending the room.
    if (recordingState === "recording") {
      await stopRecording().catch(() => undefined);
    }

    const result = await endRoomAction(room.id);

    if (!result.ok) return result.error.message;

    await leave();
    return null;
  }, [recordingState, stopRecording, room.id, leave]);

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
        toggleCaptions();
      } else if (event.key === "Escape") {
        writeCaptionsOpen(false);
      }
    }

    window.addEventListener("keydown", handleShortcut);

    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, [toggleMicrophone, toggleCaptions]);

  const backHref = guestDisplayName ? "/" : "/dashboard";

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={backHref}
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
            <BudgetChip />
          </span>
          <CopyLinkButton path={`/studio/${room.slug}`} />
          {canEndRoom && status === "connected" ? (
            <EndRoomButton onEnd={handleEndRoom} />
          ) : null}
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

      {moderationError ? (
        <p role="alert" className="border-b border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {moderationError}
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
                  href={backHref}
                  className="rounded-control border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent"
                >
                  {guestDisplayName ? "Back to home" : "Back to dashboard"}
                </Link>
              </div>
            </div>
          ) : (
            <VideoGrid
              participants={participants}
              activeSpeaker={activeSpeaker}
              status={status}
              canModerate={canModerate}
              pendingIdentity={moderationPending}
              onMuteParticipant={(identity) => void handleMuteParticipant(identity)}
              onKickParticipant={(identity) => void handleKickParticipant(identity)}
            />
          )}
        </main>

        {captionsOpen ? (
          <TranscriptRail
            entries={entries}
            active={captionsActive}
            onClose={() => writeCaptionsOpen(false)}
          />
        ) : null}
      </div>

      {status === "error" ? null : (
        <footer className="border-t border-border bg-surface px-4 py-3">
          <ControlBar
            microphoneEnabled={microphoneEnabled}
            cameraEnabled={cameraEnabled}
            captionsEnabled={captionsOpen}
            busy={mediaBusy}
            disabled={status !== "connected"}
            isRecording={recording.state === "recording" || recording.state === "uploading" || recording.state === "stopping"}
            recordingError={recording.error}
            partCount={recording.partCount}
            onToggleMicrophone={toggleMicrophone}
            onToggleCamera={toggleCamera}
            onToggleCaptions={toggleCaptions}
            onToggleRecording={
              recording.state === "idle" || recording.state === "error"
                ? recording.start
                : recording.stop
            }
            onLeave={() => void leave()}
          />
        </footer>
      )}
    </div>
  );
}
