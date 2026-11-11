import type { Metadata } from "next";
import { Suspense } from "react";

import { RoomRecordings } from "@/components/dashboard/RoomRecordings";

export const metadata: Metadata = {
  title: "Room recordings",
};

function RoomRecordingsSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="h-4 w-24 rounded bg-surface-2" />
      <div className="mt-5 h-8 w-64 rounded bg-surface-2" />
      <div className="mt-2 h-4 w-80 max-w-full rounded bg-surface-2" />
      <div className="mt-8 h-40 rounded-panel border border-border bg-surface" />
      <div className="mt-10 h-56 rounded-panel border border-border bg-surface" />
    </div>
  );
}

export default async function RoomRecordingsPage({
  params,
}: PageProps<"/dashboard/rooms/[roomId]">) {
  const { roomId } = await params;

  return (
    <Suspense fallback={<RoomRecordingsSkeleton />}>
      <RoomRecordings roomId={roomId} />
    </Suspense>
  );
}
