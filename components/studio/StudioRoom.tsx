"use client";

import { useState } from "react";

import type { Role } from "@/lib/room-policy";
import { PrejoinScreen } from "./PrejoinScreen";
import { StudioSession } from "./StudioSession";
import type { StudioPreferences } from "./useStudioRoom";

/** Pre-join device check first; the LiveKit connection only starts on join. */
export function StudioRoom({
  room,
  viewer,
  guestDisplayName,
}: {
  room: { id: string; slug: string; name: string };
  viewer: { name: string; role: Role };
  /** Present only for signed-out guests; sent with the token request. */
  guestDisplayName?: string;
}) {
  const [preferences, setPreferences] = useState<StudioPreferences | null>(null);

  if (!preferences) {
    return (
      <PrejoinScreen
        room={room}
        viewer={viewer}
        onJoin={setPreferences}
        backHref={guestDisplayName ? "/" : "/dashboard"}
      />
    );
  }

  return (
    <StudioSession
      room={room}
      viewer={viewer}
      preferences={preferences}
      guestDisplayName={guestDisplayName}
    />
  );
}
