"use client";

import { useState } from "react";

import { formatBytes, formatDuration } from "@/lib/format";

export type RecordingSummary = {
  id: string;
  mimeType: string;
  status: "uploading" | "ready" | "failed" | "deleted";
  sizeBytes: number;
  durationSec: number;
  partCount: number;
  createdAtLabel: string;
};

type PlaybackResponse = {
  url?: string;
  error?: { message?: string };
};

/**
 * Recordings list + on-demand playback.
 *
 * Playback URLs are minted per request (5-minute TTL) after a membership check,
 * so the client asks for a fresh URL every time Play is pressed. The page never
 * receives a long-lived storage URL.
 */
export function RecordingPlayer({ recordings }: { recordings: RecordingSummary[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = recordings.find((recording) => recording.id === activeId) ?? null;

  async function play(recording: RecordingSummary) {
    setLoadingId(recording.id);
    setError(null);

    try {
      const response = await fetch(
        `/api/storage/playback?id=${encodeURIComponent(recording.id)}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as PlaybackResponse | null;

      if (!response.ok || !body?.url) {
        throw new Error(body?.error?.message ?? "Could not prepare this recording.");
      }

      setActiveId(recording.id);
      setUrl(body.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not prepare this recording.");
    } finally {
      setLoadingId(null);
    }
  }

  if (recordings.length === 0) {
    return (
      <p className="rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-text-muted">
        No recordings yet. The host records the studio camera and microphone from the control bar.
      </p>
    );
  }

  return (
    <div>
      {active && url ? (
        <div className="mb-5 rounded-panel border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {active.createdAtLabel}
              <span className="ml-2 font-mono text-xs text-text-muted">
                {formatDuration(active.durationSec)} · {formatBytes(active.sizeBytes)}
              </span>
            </p>
            <button
              type="button"
              onClick={() => void play(active)}
              disabled={loadingId === active.id}
              className="rounded-control border border-border px-3 py-1 text-xs font-medium transition-colors hover:border-accent disabled:opacity-60"
            >
              {loadingId === active.id ? "Refreshing…" : "Refresh link"}
            </button>
          </div>

          {active.mimeType.startsWith("video/") ? (
            <video
              key={url}
              src={url}
              controls
              autoPlay
              playsInline
              className="mt-3 aspect-video w-full rounded-panel bg-black"
            />
          ) : (
            <audio key={url} src={url} controls autoPlay className="mt-4 w-full" />
          )}

          <p className="mt-2 text-xs text-text-muted">
            Links expire after five minutes. Press Refresh link if playback stops.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mb-4 rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
        {recordings.map((recording) => {
          const playable = recording.status === "ready";

          return (
            <li
              key={recording.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{recording.createdAtLabel}</p>
                <p className="mt-0.5 font-mono text-[11px] text-text-muted">
                  {formatDuration(recording.durationSec)} · {formatBytes(recording.sizeBytes)} ·{" "}
                  {recording.partCount} {recording.partCount === 1 ? "part" : "parts"} ·{" "}
                  {recording.mimeType}
                  {recording.status !== "ready" ? ` · ${recording.status}` : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void play(recording)}
                disabled={!playable || loadingId === recording.id}
                className="rounded-control border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingId === recording.id
                  ? "Preparing…"
                  : activeId === recording.id
                    ? "Playing"
                    : playable
                      ? "Play"
                      : "Not ready"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
