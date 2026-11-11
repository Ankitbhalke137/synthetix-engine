"use client";

/**
 * Caption rail shell. The speech pipeline (Phase 5) appends entries into the
 * live region; until then the empty state explains itself instead of faking
 * transcript lines.
 */
export function TranscriptRail({ onClose }: { onClose: () => void }) {
  return (
    <>
      <button
        type="button"
        aria-label="Close transcript"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-x-0 top-0 bottom-[69px] z-10 bg-black/40 lg:hidden"
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
          <div className="rounded-panel border border-dashed border-border p-4">
            <p className="text-sm font-medium">No captions yet</p>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              Speech is transcribed server-side and streamed into this rail with speaker names and
              timestamps. Toggle CC once the caption pipeline is enabled.
            </p>
          </div>
        </div>

        <p className="border-t border-border px-4 py-2 text-xs text-text-muted">
          Transcripts keep their room and can be exported after the call.
        </p>
      </aside>
    </>
  );
}
