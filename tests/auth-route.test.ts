import { describe, expect, it } from "vitest";

import { GET, POST } from "../app/api/auth/[...all]/route";

const BASE = "http://localhost:3000/api/auth";

describe("auth route handler", () => {
  it("returns no session for a request without cookies", async () => {
    const response = await GET(new Request(`${BASE}/get-session`));

    expect(response.status).toBe(200);
    // Better Auth returns a literal null when unauthenticated.
    expect(await response.json()).toBeNull();
  });

  it("rejects sign-in without credentials (validation, no DB hit)", async () => {
    const response = await POST(
      new Request(`${BASE}/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });
});
