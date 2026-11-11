"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import {
  endLiveKitRoom,
  muteLiveKitMicrophone,
  removeLiveKitParticipant,
  sendLiveKitEvent,
} from "@/lib/livekit";
import { getPrisma } from "@/lib/prisma";
import { can, parseRole, type Capability, type Role } from "@/lib/room-policy";
import { getSession } from "@/lib/session";

/**
 * Host/moderator room control (RBAC doc §5, PRD P0-9).
 *
 * Every action follows the same shape: session → membership → capability →
 * target resolved *through membership* → DB mutation + AuditEvent → LiveKit
 * side effect. The client cannot name a role or supply a raw user id.
 */

const IdSchema = z.string().uuid("Invalid id.");
const IdentitySchema = z.string().trim().min(1).max(160);

export type ModerationResult =
  | { ok: true; muted?: boolean }
  | { ok: false; error: { code: string; message: string } };

class ActionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ActionError";
    this.code = code;
  }
}

function failure(error: unknown): ModerationResult {
  if (error instanceof ActionError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }

  throw error;
}

function parseId(value: string, label: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw new ActionError("INVALID_INPUT", `${label} is invalid.`);
  return parsed.data;
}

function parseIdentity(value: string): string {
  const parsed = IdentitySchema.safeParse(value);
  if (!parsed.success) throw new ActionError("INVALID_INPUT", "Participant identity is invalid.");
  return parsed.data;
}

type RoomContext = {
  room: { id: string; slug: string; status: string };
  actor: { userId: string; participantId: string; role: Role };
};

/** Session → member → capability. Throws an `ActionError` on every deny. */
async function requireCapability(roomId: string, capability: Capability): Promise<RoomContext> {
  const session = await getSession(await headers());

  if (!session) {
    throw new ActionError("UNAUTHENTICATED", "Sign in to moderate this room.");
  }

  const room = await getPrisma().room.findUnique({
    where: { id: roomId },
    select: { id: true, slug: true, status: true },
  });

  if (!room) {
    throw new ActionError("ROOM_NOT_FOUND", "This room does not exist.");
  }

  const participant = await getPrisma().roomParticipant.findUnique({
    where: { roomId_userId: { roomId, userId: session.user.id } },
    select: { id: true, role: true },
  });

  const role = parseRole(participant?.role);

  if (!participant || !role) {
    throw new ActionError("FORBIDDEN", "You are not a member of this room.");
  }

  if (!can(role, capability)) {
    throw new ActionError("FORBIDDEN", "Your role cannot perform this action.");
  }

  return { room, actor: { userId: session.user.id, participantId: participant.id, role } };
}

/**
 * Resolve a LiveKit identity to a membership row. Signed-in users use their
 * user id; guests use `guest:<participantId>` (lib/rooms.ts).
 */
async function resolveTarget(roomId: string, identity: string) {
  const db = getPrisma();
  const select = { id: true, userId: true, displayName: true, role: true } as const;

  if (identity.startsWith("guest:")) {
    return db.roomParticipant.findFirst({
      where: { id: identity.slice("guest:".length), roomId },
      select,
    });
  }

  return db.roomParticipant.findUnique({
    where: { roomId_userId: { roomId, userId: identity } },
    select,
  });
}

/**
 * End the room for everyone: mark the DB state first (authoritative), then
 * notify and disconnect LiveKit participants best-effort. Idempotent.
 */
export async function endRoomAction(roomId: string): Promise<ModerationResult> {
  try {
    const id = parseId(roomId, "Room id");
    const { room, actor } = await requireCapability(id, "endRoom");

    if (room.status === "ended" || room.status === "archived") {
      return { ok: true };
    }

    const now = new Date();

    await getPrisma().$transaction([
      getPrisma().room.update({
        where: { id },
        data: { status: "ended", endedAt: now },
      }),
      getPrisma().roomParticipant.updateMany({
        where: { roomId: id, leftAt: null },
        data: { leftAt: now },
      }),
      getPrisma().auditEvent.create({
        data: {
          roomId: id,
          actorId: actor.userId,
          action: "room.ended",
          metadata: { role: actor.role },
        },
      }),
    ]);

    // Give the data frame a moment to reach clients before the room disappears;
    // deleting first can drop the packet and leave guests with a generic error.
    await sendLiveKitEvent(room.slug, { type: "room-ended" }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await endLiveKitRoom(room.slug).catch(() => undefined);

    revalidatePath("/dashboard");
    revalidatePath(`/studio/${room.slug}`);

    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Remove one participant from the room. Idempotent for already-departed users. */
export async function kickParticipantAction(
  roomId: string,
  targetIdentity: string,
): Promise<ModerationResult> {
  try {
    const id = parseId(roomId, "Room id");
    const identity = parseIdentity(targetIdentity);
    const { room, actor } = await requireCapability(id, "kick");

    const target = await resolveTarget(id, identity);

    if (!target) throw new ActionError("PARTICIPANT_NOT_FOUND", "That participant is not in this room.");
    if (target.role === "host") {
      throw new ActionError("FORBIDDEN", "The host cannot be removed.");
    }
    if (target.id === actor.participantId) {
      throw new ActionError("FORBIDDEN", "Use Leave to remove yourself.");
    }

    await getPrisma().$transaction([
      getPrisma().roomParticipant.update({
        where: { id: target.id },
        data: { leftAt: new Date() },
      }),
      getPrisma().auditEvent.create({
        data: {
          roomId: id,
          actorId: actor.userId,
          action: "participant.kicked",
          targetId: target.id,
          metadata: { identity, displayName: target.displayName },
        },
      }),
    ]);

    await sendLiveKitEvent(room.slug, { type: "kicked", identity }, [identity]).catch(
      () => undefined,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    await removeLiveKitParticipant(room.slug, identity).catch(() => undefined);

    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Mute the target's published microphone. No-op when they have no live mic. */
export async function muteParticipantAction(
  roomId: string,
  targetIdentity: string,
): Promise<ModerationResult> {
  try {
    const id = parseId(roomId, "Room id");
    const identity = parseIdentity(targetIdentity);
    const { room, actor } = await requireCapability(id, "muteOthers");

    const target = await resolveTarget(id, identity);

    if (!target) throw new ActionError("PARTICIPANT_NOT_FOUND", "That participant is not in this room.");
    if (target.role === "host") {
      throw new ActionError("FORBIDDEN", "The host cannot be muted.");
    }
    if (target.id === actor.participantId) {
      throw new ActionError("FORBIDDEN", "Use the mic control to mute yourself.");
    }

    const muted = await muteLiveKitMicrophone(room.slug, identity);

    if (muted) {
      await getPrisma().auditEvent.create({
        data: {
          roomId: id,
          actorId: actor.userId,
          action: "participant.muted",
          targetId: target.id,
          metadata: { identity, live: true },
        },
      });
    }

    return { ok: true, muted };
  } catch (error) {
    return failure(error);
  }
}
