import Link from "next/link";

export default function StudioNotFound() {
  return (
    <div className="grid h-dvh place-items-center bg-bg px-4">
      <div className="w-full max-w-md rounded-panel border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold">Room not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          This link does not match a room. Check the invite link or open your dashboard.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex rounded-control border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
