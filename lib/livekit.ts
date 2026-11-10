import "server-only";

import { AccessToken } from "livekit-server-sdk";

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
