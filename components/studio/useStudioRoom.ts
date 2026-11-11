"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionState, Room, RoomEvent, Track, type Participant } from "livekit-client";

import { parseRole, type Role } from "@/lib/room-policy";

export type StudioStatus = "connecting" | "connected" | "reconnecting" | "error";

export type StudioParticipant = {
  identity: string;
  name: string;
  isLocal: boolean;
  role: Role | null;
  isSpeaking: boolean;
  isMicrophoneEnabled: boolean;
  isCameraEnabled: boolean;
  videoTrack: Track | null;
  audioTrack: Track | null;
};

type TokenResponse = { token: string; url: string };

/** LiveKit's own retries can leave a join pending; surface it instead of spinning. */
const CONNECT_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Token metadata is opaque JSON set at mint time (lib/room-policy.ts). */
function roleFromMetadata(metadata: string | undefined): Role | null {
  if (!metadata) return null;

  try {
    const parsed: unknown = JSON.parse(metadata);
    if (typeof parsed !== "object" || parsed === null) return null;

    const role = Reflect.get(parsed, "role");
    return typeof role === "string" ? parseRole(role) : null;
  } catch {
    return null;
  }
}

/** Current room roster, local participant first. Re-read after every event. */
function snapshot(room: Room): StudioParticipant[] {
  const local = room.localParticipant;
  const everyone: Participant[] = [local, ...room.remoteParticipants.values()];

  return everyone
    .map((participant) => ({
      identity: participant.identity,
      name: participant.name || participant.identity,
      isLocal: participant === local,
      role: roleFromMetadata(participant.metadata),
      isSpeaking: participant.isSpeaking,
      isMicrophoneEnabled: participant.isMicrophoneEnabled,
      isCameraEnabled: participant.isCameraEnabled,
      videoTrack: participant.getTrackPublication(Track.Source.Camera)?.track ?? null,
      audioTrack: participant.getTrackPublication(Track.Source.Microphone)?.track ?? null,
    }))
    .sort((a, b) => Number(b.isLocal) - Number(a.isLocal));
}

function messageFrom(payload: unknown): string {
  if (typeof payload === "object" && payload !== null) {
    const error = Reflect.get(payload, "error");

    if (typeof error === "object" && error !== null) {
      const message = Reflect.get(error, "message");
      if (typeof message === "string") return message;
    }
  }

  return "Could not join this room.";
}

export type StudioPreferences = { microphone: boolean; camera: boolean };

/**
 * Owns the LiveKit connection for one studio session: token fetch → connect →
 * event-driven roster → cleanup. The room is disconnected on unmount and on
 * retry, so a failed join never leaves a dangling socket.
 */
export function useStudioRoom(slug: string, preferences: StudioPreferences) {
  const router = useRouter();
  const roomRef = useRef<Room | null>(null);
  const leavingRef = useRef(false);
  const [status, setStatus] = useState<StudioStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [mediaBlocked, setMediaBlocked] = useState(false);
  const [participants, setParticipants] = useState<StudioParticipant[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    leavingRef.current = false;

    const sync = () => {
      if (!disposed) setParticipants(snapshot(room));
    };

    const onState = (state: ConnectionState) => {
      if (disposed) return;

      if (state === ConnectionState.Connected) {
        setStatus("connected");
        sync();
      } else if (state === ConnectionState.Connecting) {
        setStatus("connecting");
      } else if (
        state === ConnectionState.Reconnecting ||
        state === ConnectionState.SignalReconnecting
      ) {
        setStatus("reconnecting");
      }
    };

    const onSpeakers = (speakers: Participant[]) => {
      if (disposed) return;
      setActiveSpeaker(speakers[0]?.identity ?? null);
      sync();
    };

    const onDisconnected = () => {
      if (disposed || leavingRef.current) return;
      setStatus("error");
      setError("The connection ended. Rejoin when you are ready.");
    };

    room.on(RoomEvent.ConnectionStateChanged, onState);
    room.on(RoomEvent.ParticipantConnected, sync);
    room.on(RoomEvent.ParticipantDisconnected, sync);
    room.on(RoomEvent.TrackSubscribed, sync);
    room.on(RoomEvent.TrackUnsubscribed, sync);
    room.on(RoomEvent.TrackMuted, sync);
    room.on(RoomEvent.TrackUnmuted, sync);
    room.on(RoomEvent.LocalTrackPublished, sync);
    room.on(RoomEvent.LocalTrackUnpublished, sync);
    room.on(RoomEvent.ActiveSpeakersChanged, onSpeakers);
    room.on(RoomEvent.Disconnected, onDisconnected);

    async function start() {
      try {
        const response = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug }),
        });

        if (!response.ok) {
          throw new Error(messageFrom(await response.json().catch(() => null)));
        }

        const { token, url } = (await response.json()) as TokenResponse;
        if (disposed) return;

        await withTimeout(
          room.connect(url, token),
          CONNECT_TIMEOUT_MS,
          "The media server did not respond. Check your connection and try again.",
        );
        if (disposed) return;
        setStatus("connected");

        // Publish only what the pre-join screen asked for. A denial must not
        // drop the connection — it becomes a banner and the room still works.
        const requests: Promise<unknown>[] = [];

        if (preferences.camera) requests.push(room.localParticipant.setCameraEnabled(true));
        if (preferences.microphone) requests.push(room.localParticipant.setMicrophoneEnabled(true));

        const media = await Promise.allSettled(requests);

        if (disposed) return;
        if (media.some((result) => result.status === "rejected")) setMediaBlocked(true);
        sync();
      } catch (cause) {
        if (disposed) return;
        void room.disconnect();
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "Could not join this room.");
      }
    }

    void start();

    return () => {
      disposed = true;
      room.removeAllListeners();
      roomRef.current = null;
      void room.disconnect();
    };
  }, [slug, attempt, preferences.camera, preferences.microphone]);

  const retry = useCallback(() => {
    setError(null);
    setMediaBlocked(false);
    setStatus("connecting");
    setActiveSpeaker(null);
    setParticipants([]);
    setAttempt((current) => current + 1);
  }, []);

  const leave = useCallback(async () => {
    leavingRef.current = true;
    await roomRef.current?.disconnect().catch(() => undefined);
    router.push("/dashboard");
    router.refresh();
  }, [router]);

  return { status, error, mediaBlocked, participants, activeSpeaker, retry, leave };
}
