"use client";

import type { StudioParticipant, StudioStatus } from "./useStudioRoom";
import { ParticipantTile } from "./ParticipantTile";

export function VideoGrid({
  participants,
  activeSpeaker,
  status,
  canModerate = false,
  pendingIdentity = null,
  onMuteParticipant,
  onKickParticipant,
}: {
  participants: StudioParticipant[];
  activeSpeaker: string | null;
  status: StudioStatus;
  /** Viewer holds host/moderator rights. */
  canModerate?: boolean;
  pendingIdentity?: string | null;
  onMuteParticipant?: (identity: string) => void;
  onKickParticipant?: (identity: string) => void;
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
  // Three or four participants use a 2×2 grid: wider tiles mean sharp 720p
  // video instead of four postage stamps. Only larger rooms add a third column.
  const layout =
    participants.length === 1
      ? "mx-auto w-full max-w-5xl grid-cols-1"
      : participants.length === 2
        ? "mx-auto w-full max-w-6xl grid-cols-1 sm:grid-cols-2"
        : participants.length <= 4
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <div className={`grid h-full content-center gap-3 ${layout}`}>
      {participants.map((participant) => (
        <ParticipantTile
          key={participant.identity}
          participant={participant}
          promoted={promoteSpeaker && participant.identity === activeSpeaker}
          canModerate={
            canModerate && !participant.isLocal && participant.role !== "host" && !!participant.role
          }
          moderationBusy={pendingIdentity === participant.identity}
          onMute={() => onMuteParticipant?.(participant.identity)}
          onKick={() => onKickParticipant?.(participant.identity)}
        />
      ))}
    </div>
  );
}
