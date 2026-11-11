export function RoomsSkeleton() {
  return (
    <div>
      <p className="sr-only">Loading rooms…</p>
      <div aria-hidden className="mt-8 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-36 animate-pulse rounded-panel border border-border bg-surface" />
        ))}
      </div>
    </div>
  );
}
