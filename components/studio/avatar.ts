/** Shared avatar helpers: initials plus a deterministic hue per identity. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

export function avatarColor(identity: string): string {
  let hash = 0;

  for (const character of identity) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }

  return `oklch(0.34 0.07 ${hash})`;
}
