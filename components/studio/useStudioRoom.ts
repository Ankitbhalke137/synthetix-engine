"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type Participant,
} from "livekit-client";

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

type TokenResponse = { token: string; url: string; roomId: string };

/** LiveKit's own retries can leave a join pending; surface it instead of spinning. */
const CONNECT_TIMEOUT_MS = 20_000;

/** Assumed session length for the preflight budget guard (PRD P0-8). */
const PREFLIGHT_SESSION_MINUTES = 45;

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
 *
 * `onCaption` is called for server-authored caption frames received over the
 * LiveKit DataChannel (Phase 5 STT pipeline).
 */
export function useStudioRoom(
  slug: string,
  preferences: StudioPreferences,
  onCaption?: (frame: {
    seq: number;
    speakerId: string;
    speaker: string;
    text: string;
    startMs: number;
    endMs: number;
  }) => void,
) {
  const router = useRouter();
  const roomRef = useRef<Room | null>(null);
  const leavingRef = useRef(false);
  const onCaptionRef = useRef<typeof onCaption>(onCaption);

  // Usage metering: the moment the participant actually connected, and which
  // room. Reported once, on disconnect/unmount, so the monthly budget moves.
  const joinedAtRef = useRef<number | null>(null);
  const joinedRoomIdRef = useRef<string | null>(null);

  useEffect(() => {
    onCaptionRef.current = onCaption;
  }, [onCaption]);
  const [status, setStatus] = useState<StudioStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [mediaBlocked, setMediaBlocked] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
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

    const reportUsage = () => {
      const joinedAt = joinedAtRef.current;
      const joinedRoomId = joinedRoomIdRef.current;

      if (!joinedAt || !joinedRoomId) return;

      joinedAtRef.current = null;
      joinedRoomIdRef.current = null;

      const participantSeconds = Math.max(0, Math.round((Date.now() - joinedAt) / 1000));

      // `keepalive` lets the request outlive a navigation away from the studio.
      void fetch("/api/livekit/usage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: joinedRoomId, participantSeconds }),
        keepalive: true,
      }).catch(() => undefined);
    };

    const onDisconnected = () => {
      if (disposed) return;
      reportUsage();
      if (leavingRef.current) return;
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

    const onData = (data: Uint8Array) => {
      if (disposed || !onCaptionRef.current) return;

      try {
        const frame = JSON.parse(new TextDecoder().decode(data)) as {
          v?: number;
          type?: string;
          roomId?: string;
          seq?: number;
          speakerId?: string;
          speaker?: string;
          text?: string;
          startMs?: number;
          endMs?: number;
        };

        // Server-authored caption frames only.
        if (frame.v === 1 && frame.type === "caption" && typeof frame.seq === "number") {
          onCaptionRef.current({
            seq: frame.seq,
            speakerId: frame.speakerId ?? "",
            speaker: frame.speaker ?? "",
            text: frame.text ?? "",
            startMs: frame.startMs ?? 0,
            endMs: frame.endMs ?? 0,
          });
        }
      } catch {
        // Malformed data packet — ignore.
      }
    };

    room.on(RoomEvent.DataReceived, onData);

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

        const { token, url, roomId } = (await response.json()) as TokenResponse;
        if (disposed) return;

        // Preflight guard: block the join when the projected session would
        // exceed the LiveKit free-tier cap. Fail open on network errors.
        const preflight = await fetch(`/api/preflight/${roomId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionMinutes: PREFLIGHT_SESSION_MINUTES }),
        });

        if (preflight.ok) {
          const guard = (await preflight.json().catch(() => null)) as {
            allowed?: boolean;
            message?: string;
          } | null;

          if (guard && guard.allowed === false) {
            throw new Error(guard.message ?? "LiveKit quota is exhausted for this month.");
          }
        }

        if (disposed) return;

        await withTimeout(
          room.connect(url, token),
          CONNECT_TIMEOUT_MS,
          "The media server did not respond. Check your connection and try again.",
        );
        if (disposed) return;
        joinedAtRef.current = Date.now();
        joinedRoomIdRef.current = roomId;
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
      reportUsage();
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

  /** Local mute/camera are optimistic only at the UI level; LiveKit is truth. */
  const toggleDevice = useCallback(async (device: "microphone" | "camera") => {
    const room = roomRef.current;
    if (!room) return;

    setMediaBusy(true);

    try {
      if (device === "microphone") {
        await room.localParticipant.setMicrophoneEnabled(
          !room.localParticipant.isMicrophoneEnabled,
        );
      } else {
        await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled);
      }

      setParticipants(snapshot(room));
    } catch {
      setMediaBlocked(true);
    } finally {
      setMediaBusy(false);
    }
  }, []);

  const toggleMicrophone = useCallback(() => {
    void toggleDevice("microphone");
  }, [toggleDevice]);

  const toggleCamera = useCallback(() => {
    void toggleDevice("camera");
  }, [toggleDevice]);

  return {
    status,
    error,
    mediaBlocked,
    mediaBusy,
    participants,
    activeSpeaker,
    retry,
    leave,
    toggleMicrophone,
    toggleCamera,
  };
}
