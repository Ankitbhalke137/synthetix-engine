import { z } from "zod";

/**
 * Auth form contracts, shared by the client form and any server-side checks.
 * Password floor matches Better Auth's `minPasswordLength: 10` (lib/auth.ts).
 */
export const SignInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const SignUpSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.email(),
  password: z.string().min(10).max(128),
});

export type SignInInput = z.infer<typeof SignInSchema>;
export type SignUpInput = z.infer<typeof SignUpSchema>;
