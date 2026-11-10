import { z } from "zod";

/**
 * Role and capability policy (RBAC doc §1–2), kept as plain data so both the
 * token mint and (later) server actions share one source of truth.
 *
 * Mirrors the `ParticipantRole` enum in prisma/schema.prisma — keep in sync.
 */
export const ROLES = ["host", "moderator", "participant", "viewer"] as const;

export type Role = (typeof ROLES)[number];

export const RoleSchema = z.enum(ROLES);

/** Capabilities the UI and server-side authz both ask about. */
const MATRIX = {
  publish: ["host", "moderator", "participant"],
  muteOthers: ["host", "moderator"],
  kick: ["host", "moderator"],
  promote: ["host"],
  endRoom: ["host", "moderator"],
  record: ["host"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof MATRIX;

/** Does `role` hold `capability` in its room? */
export function can(role: Role, capability: Capability): boolean {
  const allowed: readonly Role[] = MATRIX[capability];
  return allowed.includes(role);
}

/**
 * Publish rights are enforced by the SFU via token grants — the client UI is
 * cosmetic only (RBAC doc §3, Layer 2).
 */
export function canPublish(role: Role): boolean {
  return can(role, "publish");
}

/**
 * LiveKit participant metadata: the client reads it to mirror the role in the
 * UI (Layer 3). Authorization decisions always re-derive the role from the DB.
 */
export function tokenMetadata(role: Role, roomId: string): string {
  return JSON.stringify({ role, roomId });
}

/**
 * Parses role-ish input (e.g. a DB string) into a `Role`, or null when the
 * value is not part of the enum. Used at trust boundaries — never cast.
 */
export function parseRole(value: string | null | undefined): Role | null {
  const parsed = RoleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Room slug: readable prefix + random suffix so slugs are unique and retired. */
export function buildRoomSlug(name: string, suffix: string): string {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

  return `${base || "room"}-${suffix}`;
}
