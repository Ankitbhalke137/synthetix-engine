import Link from "next/link";

import { CopyLinkButton } from "@/components/CopyLinkButton";
import type { RoomStatus } from "@/lib/rooms";

const STATUS_STYLES: Record<RoomStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "border-border bg-surface-2 text-text-muted" },
  live: { label: "Live", className: "border-live/40 bg-live/10 text-live" },
  ended: { label: "Ended", className: "border-border bg-surface text-text-muted" },
  archived: { label: "Archived", className: "border-border bg-surface text-text-muted" },
};

export function RoomCard({
  id,
  slug,
  name,
  status,
  createdAt,
  participants,
}: {
  id: string;
  slug: string;
  name: string;
  status: RoomStatus;
  createdAt: Date;
  participants: number;
}) {
  const badge = STATUS_STYLES[status];
  const joinable = status === "draft" || status === "live";

  return (
    <article className="flex h-full flex-col justify-between gap-4 rounded-panel border border-border bg-surface p-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold">{name}</h3>
          <span
            className={`inline-flex items-center gap-1.5 rounded-control border px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.06em] uppercase ${badge.className}`}
          >
            {status === "live" ? <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-live" /> : null}
            {badge.label}
          </span>
        </div>
        <p className="mt-1 font-mono text-xs text-text-muted">
          {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(createdAt)}
          {" · "}
          {participants} {participants === 1 ? "participant" : "participants"}
        </p>
      </div>

      {joinable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/studio/${slug}`}
            className="inline-flex w-fit items-center rounded-control border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent"
          >
            {status === "draft" ? "Open studio" : "Join room"}
          </Link>
          <CopyLinkButton
            path={`/studio/${slug}`}
            label="Copy link"
            className="inline-flex w-fit items-center rounded-control border border-border px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:border-accent hover:text-text"
          />
        </div>
      ) : (
        <Link
          href={`/dashboard/rooms/${id}`}
          className="inline-flex w-fit items-center rounded-control border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent"
        >
          Recordings &amp; transcript
        </Link>
      )}
    </article>
  );
}
