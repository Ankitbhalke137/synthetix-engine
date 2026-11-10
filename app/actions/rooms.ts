"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { getPrisma } from "@/lib/prisma";
import { createRoom, prismaRoomStore } from "@/lib/rooms";
import { getSession } from "@/lib/session";

const CreateRoomSchema = z.object({
  name: z.string().trim().min(3).max(80),
});

export type CreateRoomResult =
  | { ok: true; slug: string }
  | { ok: false; error: { code: string; message: string } };

/**
 * Creates a draft room for the signed-in user, who becomes its host member.
 * The studio UI (Phase 4) calls this from the dashboard form.
 */
export async function createRoomAction(formData: FormData): Promise<CreateRoomResult> {
  const session = await getSession(await headers());

  if (!session) {
    return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in to create a room." } };
  }

  const parsed = CreateRoomSchema.safeParse({ name: formData.get("name") });

  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Room name must be 3–80 characters." },
    };
  }

  const room = await createRoom(prismaRoomStore(getPrisma()), {
    host: { id: session.user.id, name: session.user.name },
    name: parsed.data.name,
  });

  return { ok: true, slug: room.slug };
}
