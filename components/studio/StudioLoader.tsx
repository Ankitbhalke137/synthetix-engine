import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getPrisma } from "@/lib/prisma";
import { parseRole } from "@/lib/room-policy";
import { getSession } from "@/lib/session";
import { StudioRoom } from "./StudioRoom";

function RoomStateCard({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="grid h-dvh place-items-center bg-bg px-4">
      <div className="w-full max-w-md rounded-panel border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">{children}</p>
        <div className="mt-5">{action}</div>
      </div>
    </div>
  );
}

/**
 * Runtime half of `/studio/[roomSlug]`, streamed inside the page's Suspense
 * boundary: session → membership → room state, then the client session.
 * The token endpoint re-derives the role when the client actually joins.
 */
export async function StudioLoader({ roomSlug }: { roomSlug: string }) {
  const session = await getSession(await headers());

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/studio/${roomSlug}`)}`);
  }

  const room = await getPrisma().room.findUnique({
    where: { slug: roomSlug },
    select: {
      slug: true,
      name: true,
      status: true,
      hostId: true,
      participants: {
        where: { userId: session.user.id },
        take: 1,
        select: { displayName: true, role: true },
      },
    },
  });

  if (!room) {
    notFound();
  }

  const isHost = room.hostId === session.user.id;
  const membership = room.participants[0];
  const role = parseRole(membership?.role) ?? (isHost ? "host" : "participant");

  if (room.status === "ended" || room.status === "archived") {
    return (
      <RoomStateCard
        title={room.status === "ended" ? "This room has ended" : "This room is archived"}
        action={
          <Link
            href="/dashboard"
            className="inline-flex rounded-control border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent"
          >
            Back to dashboard
          </Link>
        }
      >
        Recordings and transcripts will appear here after the session is processed.
      </RoomStateCard>
    );
  }

  if (room.status === "draft" && role !== "host") {
    return (
      <RoomStateCard
        title="The room has not started yet"
        action={
          <Link
            href="/dashboard"
            className="inline-flex rounded-control border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent"
          >
            Back to dashboard
          </Link>
        }
      >
        The host opens this room before anyone can join. Ask them to start it, then reload this page.
      </RoomStateCard>
    );
  }

  return (
    <StudioRoom
      room={{ slug: room.slug, name: room.name }}
      viewer={{ name: membership?.displayName ?? session.user.name, role }}
    />
  );
}
