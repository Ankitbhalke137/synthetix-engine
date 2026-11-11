"use client";

import type { StudioParticipant, StudioStatus } from "./useStudioRoom";
import { ParticipantTile } from "./ParticipantTile";

export function VideoGrid({
  participants,
  activeSpeaker,
  status,
}: {
  participants: StudioParticipant[];
  activeSpeaker: string | null;
  status: StudioStatus;
}) {
  if (participants.length === 0) {
    return (
      <div className="grid h-full place-items-center rounded-panel border border-dashed border-border bg-surface/40 p-8 text-center">
        <div>
          <p className="text-sm font-medium">
            {status === "reconnecting" ? "Reconnecting…" : "Connecting to the room…"}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Your camera preview appears here once you are connected.
          </p>
        </div>
      </div>
    );
  }

  // Promote the active speaker only once there is a grid worth promoting in.
  const promoteSpeaker = participants.length >= 3;

  // Size the grid to the roster so one or two guests do not sit in a corner.
  const layout =
    participants.length === 1
      ? "mx-auto w-full max-w-3xl grid-cols-1"
      : participants.length === 2
        ? "mx-auto w-full max-w-5xl grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <div className={`grid h-full content-center gap-3 ${layout}`}>
      {participants.map((participant) => (
        <ParticipantTile
          key={participant.identity}
          participant={participant}
          promoted={promoteSpeaker && participant.identity === activeSpeaker}
        />
      ))}
    </div>
  );
}
