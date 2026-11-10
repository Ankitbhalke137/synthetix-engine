"use client";

import { createAuthClient } from "better-auth/react";

/** Browser-side auth client. Same-origin; no secrets involved. */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
