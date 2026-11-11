import type { Role } from "@/lib/room-policy";

export const ROLE_LABEL: Record<Role, string> = {
  host: "Host",
  moderator: "Moderator",
  participant: "Participant",
  viewer: "Viewer",
};
