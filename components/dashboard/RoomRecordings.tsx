import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { RecordingPlayer, type RecordingSummary } from "@/components/dashboard/RecordingPlayer";
import { formatTimestamp } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const RoomIdSchema = z.string().uuid();

const ROOM_STATUS_LABEL = {
  draft: "Draft",
  live: "Live",
  ended: "Ended",
  archived: "Archived",
} as const;

/**
 * Room detail for finished sessions: authorized playback + the persisted
 * transcript. Runtime data sits behind the page's Suspense boundary so the
 * static shell can stream (Cache Components).
 */
export async function RoomRecordings({ roomId }: { roomId: string }) {
  const parsedId = RoomIdSchema.safeParse(roomId);
  if (!parsedId.success) notFound();

  const session = await getSession(await headers());
  if (!session) redirect("/login");

  const db = getPrisma();

  const [room, membership] = await Promise.all([
    db.room.findUnique({
      where: { id: parsedId.data },
      select: { id: true, name: true, status: true, createdAt: true },
    }),
    db.roomParticipant.findUnique({
      where: { roomId_userId: { roomId: parsedId.data, userId: session.user.id } },
      select: { role: true },
    }),
  ]);

  if (!room || !membership) notFound();

  const [recordings, transcripts] = await Promise.all([
    db.recording.findMany({
      where: { roomId: room.id, status: { not: "deleted" } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        mimeType: true,
        status: true,
        sizeBytes: true,
        durationSec: true,
        partCount: true,
        createdAt: true,
      },
    }),
    db.transcript.findMany({
      where: { roomId: room.id },
      orderBy: { startMs: "asc" },
      take: 500,
      select: { id: true, speaker: true, text: true, startMs: true, endMs: true },
    }),
  ]);

  const dateFormat = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const summaries: RecordingSummary[] = recordings.map((recording) => ({
    id: recording.id,
    mimeType: recording.mimeType,
    status: recording.status,
    sizeBytes: Number(recording.sizeBytes),
    durationSec: recording.durationSec,
    partCount: recording.partCount,
    createdAtLabel: dateFormat.format(recording.createdAt),
  }));

  return (
    <div>
      <Link
        href="/dashboard"
        className="text-sm text-text-muted transition-colors hover:text-text"
      >
        ← Dashboard
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{room.name}</h1>
        <span className="rounded-control border border-border bg-surface px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.06em] uppercase">
          {ROOM_STATUS_LABEL[room.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-text-muted">
        {dateFormat.format(room.createdAt)} · host recording and session transcript. Only room
        members can play these.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Recordings</h2>
        <p className="mt-1 text-sm text-text-muted">
          The host&apos;s camera and microphone, captured in the browser and uploaded directly to
          Neon Object Storage.
        </p>
        <div className="mt-4">
          <RecordingPlayer recordings={summaries} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Transcript</h2>
        <p className="mt-1 text-sm text-text-muted">
          Session-relative timestamps, attributed to the active speaker.
        </p>

        {transcripts.length === 0 ? (
          <p className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-text-muted">
            No transcript was captured for this room.
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
            {transcripts.map((line) => (
              <li key={line.id} className="flex gap-3 px-4 py-3">
                <span className="w-12 shrink-0 font-mono text-[11px] text-text-muted">
                  {formatTimestamp(line.startMs)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-muted">{line.speaker}</p>
                  <p className="mt-0.5 text-sm leading-relaxed">{line.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {transcripts.length === 500 ? (
          <p className="mt-2 text-xs text-text-muted">
            Showing the first 500 lines ({formatTimestamp(transcripts.at(-1)?.endMs ?? 0)}{" "}
            captured).
          </p>
        ) : null}
      </section>
    </div>
  );
}
