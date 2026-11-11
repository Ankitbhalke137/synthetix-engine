export function StudioSkeleton() {
  return (
    <div aria-busy="true" className="flex h-dvh flex-col bg-bg">
      <p className="sr-only">Loading the studio…</p>
      <div aria-hidden className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <div className="h-5 w-56 animate-pulse rounded bg-surface-2" />
        <div className="h-8 w-32 animate-pulse rounded-control bg-surface-2" />
      </div>
      <div aria-hidden className="grid flex-1 gap-3 p-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="animate-pulse rounded-panel border border-border bg-surface" />
        ))}
      </div>
    </div>
  );
}
