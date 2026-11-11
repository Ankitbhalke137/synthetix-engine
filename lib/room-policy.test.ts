import { describe, expect, it } from "vitest";

import { can, canPublish, parseRole, type Capability } from "./room-policy";

describe("room capability matrix", () => {
  it("lets hosts and moderators moderate, but not participants", () => {
    for (const capability of ["muteOthers", "kick", "endRoom"] satisfies Capability[]) {
      expect(can("host", capability)).toBe(true);
      expect(can("moderator", capability)).toBe(true);
      expect(can("participant", capability)).toBe(false);
      expect(can("viewer", capability)).toBe(false);
    }
  });

  it("keeps promotion and recording host-only", () => {
    expect(can("host", "promote")).toBe(true);
    expect(can("moderator", "promote")).toBe(false);
    expect(can("host", "record")).toBe(true);
    expect(can("moderator", "record")).toBe(false);
  });

  it("allows everyone but viewers to publish", () => {
    expect(canPublish("host")).toBe(true);
    expect(canPublish("moderator")).toBe(true);
    expect(canPublish("participant")).toBe(true);
    expect(canPublish("viewer")).toBe(false);
  });

  it("parses only known roles", () => {
    expect(parseRole("host")).toBe("host");
    expect(parseRole("admin")).toBeNull();
    expect(parseRole(null)).toBeNull();
  });
});
