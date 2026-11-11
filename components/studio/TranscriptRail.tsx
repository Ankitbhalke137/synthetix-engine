"use client";

import type { CaptionEntry } from "./useCaptionStream";

/**
 * Caption rail. Displays live transcript entries as they stream in from the
 * STT pipeline (Phase 5). Until captions are enabled, shows an honest empty
 * state instead of faking lines. aria-live="polite" so screen readers pick up
 * new lines as they arrive.
 */
export function TranscriptRail({
  entries,
  onClose,
}: {
  entries: CaptionEntry[];
  onClose: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close transcript"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-10 bg-black/40 lg:hidden"
      />

      <aside
        aria-label="Transcript"
        className="fixed inset-x-0 bottom-[69px] z-20 flex max-h-[55dvh] flex-col rounded-t-panel border-t border-border bg-surface lg:static lg:z-auto lg:max-h-none lg:w-80 lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-l xl:w-96"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Transcript</h2>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] text-text-muted uppercase">
              <span aria-hidden className="size-1.5 rounded-full bg-text-muted" />
              Captions off
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-border px-2 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-text"
            >
              Hide
            </button>
          </div>
        </header>

        <div aria-live="polite" aria-atomic="false" className="flex-1 overflow-y-auto p-4">
          {entries.length === 0 ? (
            <div className="rounded-panel border border-dashed border-border p-4">
              <p className="text-sm font-medium">No captions yet</p>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                Speech is transcribed server-side and streamed into this rail with speaker names and
                timestamps. Toggle CC once the caption pipeline is enabled.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {entries.map((entry) => (
                <li
                  key={entry.seq}
                  className="flex gap-2 text-sm leading-relaxed"
                >
                  <span
                    className="shrink-0 w-16 text-[12px] font-mono font-semibold text-text-muted leading-tight"
                  >
                    {formatMs(entry.startMs)} – {formatMs(entry.endMs)}
                  </span>
                  <span className="shrink-0 text-[12px] font-mono font-semibold text-accent">
                    {entry.speaker}
                  </span>
                  <p className="min-w-0 break-words text-text">{entry.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="border-t border-border px-4 py-2 text-xs text-text-muted">
          Transcripts keep their room and can be exported after the call.
        </p>
      </aside>
    </>
  );
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis
    .toString()
    .padStart(3, "0")}`;
}
