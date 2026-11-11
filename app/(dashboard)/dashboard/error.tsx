"use client";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  return (
    <div className="rounded-panel border border-danger/40 bg-danger/10 p-6">
      <h1 className="text-lg font-semibold">We could not load your rooms</h1>
      <p className="mt-2 text-sm text-text-muted">
        The request failed — your data is safe. Try again, and if it keeps happening share the error
        reference below.
      </p>
      {error.digest ? <p className="mt-3 font-mono text-xs text-text-muted">ref: {error.digest}</p> : null}
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
