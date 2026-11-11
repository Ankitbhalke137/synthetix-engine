"use client";

import { useState } from "react";

/**
 * Two-step destructive control. Ending a room disconnects every guest and
 * closes it permanently, so the first click only arms the confirmation.
 */
export function EndRoomButton({
  onEnd,
}: {
  /** Resolve with an error message, or null when the room was ended. */
  onEnd: () => Promise<string | null>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);

    const message = await onEnd();

    if (message) {
      setBusy(false);
      setError(message);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-control border border-border px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:border-danger hover:text-danger"
      >
        End room
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
      <span className="text-xs text-text-muted">End for everyone?</span>
      <button
        type="button"
        onClick={() => void confirm()}
        disabled={busy}
        className="rounded-control bg-danger px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Ending…" : "Confirm end"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="rounded-control border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        Cancel
      </button>
    </div>
  );
}
