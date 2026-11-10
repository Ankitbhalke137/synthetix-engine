import { describe, expect, it } from "vitest";

import { SignInSchema, SignUpSchema } from "@/lib/auth-schemas";

describe("SignInSchema", () => {
  it("accepts an email and any non-empty password", () => {
    const parsed = SignInSchema.safeParse({ email: "priya@example.com", password: "x" });
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed emails and empty passwords", () => {
    expect(SignInSchema.safeParse({ email: "not-an-email", password: "secret" }).success).toBe(false);
    expect(SignInSchema.safeParse({ email: "priya@example.com", password: "" }).success).toBe(false);
  });
});

describe("SignUpSchema", () => {
  it("accepts a valid sign-up and trims the name", () => {
    const parsed = SignUpSchema.safeParse({
      name: "  Priya  ",
      email: "priya@example.com",
      password: "ten-chars-min",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe("Priya");
  });

  it("enforces the Better Auth password floor of 10 characters", () => {
    const parsed = SignUpSchema.safeParse({
      name: "Priya",
      email: "priya@example.com",
      password: "short",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects blank and overlong names", () => {
    expect(SignUpSchema.safeParse({ name: " ", email: "p@example.com", password: "ten-chars-min" }).success).toBe(
      false,
    );
    expect(
      SignUpSchema.safeParse({ name: "x".repeat(61), email: "p@example.com", password: "ten-chars-min" }).success,
    ).toBe(false);
  });
});
