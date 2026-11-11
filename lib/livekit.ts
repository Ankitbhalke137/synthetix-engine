import "server-only";

import {
  AccessToken,
  DataPacket_Kind,
  RoomServiceClient,
  TrackSource,
  TrackType,
} from "livekit-server-sdk";

import { getEnv } from "@/lib/env";
import { canPublish, type Role, tokenMetadata } from "@/lib/room-policy";

/**
 * LiveKit tokens are short-lived by design (RBAC doc §6: TTL ≤ 2 h) and are
 * minted only by `POST /api/livekit/token`, never in the browser.
 */
export const TOKEN_TTL_SECONDS = 60 * 60 * 2;

export type RoomTokenInput = {
  /** Stable participant identity: user id, or `guest-<uuid>` for guests. */
  identity: string;
  /** Display name shown in the room and on captions. */
  name: string;
  role: Role;
  /** Room slug — LiveKit room name (one LiveKit room per DB room). */
  room: string;
  roomId: string;
};

/** The public WebSocket URL the browser connects to. */
export function getLiveKitUrl(): string {
  return getEnv().NEXT_PUBLIC_LIVEKIT_URL;
}

/**
 * Signs a LiveKit access token whose grants encode the role policy:
 * viewers cannot publish (SFU-enforced), hosts/moderators/participants can.
 *
 * Lazy env access means `next build` never needs LiveKit secrets.
 */
export async function mintRoomToken(input: RoomTokenInput): Promise<string> {
  const env = getEnv();

  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: input.identity,
    name: input.name,
    ttl: TOKEN_TTL_SECONDS,
    metadata: tokenMetadata(input.role, input.roomId),
  });

  token.addGrant({
    roomJoin: true,
    room: input.room,
    canPublish: canPublish(input.role),
    canSubscribe: true,
    canPublishData: canPublish(input.role),
  });

  return token.toJwt();
}

/**
 * Server-side room control (moderation). The client SDK cannot delete rooms or
 * remove participants; only the server API can, which is why every moderation
 * action re-checks the caller's role before reaching these helpers.
 */
function getRoomService(): RoomServiceClient {
  const env = getEnv();
  // LiveKit's server API is HTTPS even though clients connect over WSS.
  const host = getLiveKitUrl().replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

  return new RoomServiceClient(host, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

/** LiveKit returns 404 for rooms that are already gone — an idempotent no-op. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const code = Reflect.get(error, "code") ?? Reflect.get(error, "status");
  return code === 404 || code === "404" || code === "not_found" || code === "NOT_FOUND";
}

/** End the LiveKit room for everyone. Safe to call twice. */
export async function endLiveKitRoom(roomName: string): Promise<void> {
  try {
    await getRoomService().deleteRoom(roomName);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

/** Disconnect one participant. Safe to call twice. */
export async function removeLiveKitParticipant(
  roomName: string,
  identity: string,
): Promise<void> {
  try {
    await getRoomService().removeParticipant(roomName, identity);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

/**
 * Mute a participant's published microphone track. Returns false when the
 * participant is not connected or has no microphone publication.
 */
export async function muteLiveKitMicrophone(
  roomName: string,
  identity: string,
): Promise<boolean> {
  let participants;

  try {
    participants = await getRoomService().listParticipants(roomName);
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }

  const target = participants.find((participant) => participant.identity === identity);
  const microphone = target?.tracks.find(
    (track) => track.source === TrackSource.MICROPHONE || track.type === TrackType.AUDIO,
  );

  if (!target || !microphone) return false;

  await getRoomService().mutePublishedTrack(roomName, identity, microphone.sid, true);
  return true;
}

/**
 * Send a server-authored control frame. The client ignores data frames that
 * carry a sender participant, so peers cannot spoof a room-ended/kicked event.
 */
export async function sendLiveKitEvent(
  roomName: string,
  event: { type: "room-ended" } | { type: "kicked"; identity: string },
  destinationIdentities?: string[],
): Promise<void> {
  const data = new TextEncoder().encode(JSON.stringify({ v: 1, ...event }));

  await getRoomService().sendData(roomName, data, DataPacket_Kind.RELIABLE, {
    ...(destinationIdentities ? { destinationIdentities } : {}),
  });
}
