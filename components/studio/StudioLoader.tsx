import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getPrisma } from "@/lib/prisma";
import { parseRole } from "@/lib/room-policy";
import { getSession } from "@/lib/session";
import { GuestNameGate } from "./GuestNameGate";
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

function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex rounded-control border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent"
    >
      {children}
    </Link>
  );
}

/**
 * Runtime half of `/studio/[roomSlug]`, streamed inside the page's Suspense
 * boundary: session → membership → room state, then the client session.
 *
 * Visitors without an account are not turned away: a live room lets them pick
 * a display name and join as a guest (RBAC doc §4). The token endpoint
 * re-derives the role when the client actually joins.
 */
export async function StudioLoader({ roomSlug }: { roomSlug: string }) {
  const session = await getSession(await headers());

  const room = await getPrisma().room.findUnique({
    where: { slug: roomSlug },
    select: { id: true, slug: true, name: true, status: true, hostId: true },
  });

  if (!room) {
    notFound();
  }

  const backHref = session ? "/dashboard" : "/";
  const backLabel = session ? "Back to dashboard" : "Back to home";

  if (room.status === "ended" || room.status === "archived") {
    const canViewRecordings = session !== null && room.hostId === session.user.id;

    return (
      <RoomStateCard
        title={room.status === "ended" ? "This room has ended" : "This room is archived"}
        action={
          <div className="flex flex-wrap gap-2">
            {canViewRecordings ? (
              <Link
                href={`/dashboard/rooms/${room.id}`}
                className="inline-flex rounded-control bg-accent px-4 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
              >
                Recordings &amp; transcript
              </Link>
            ) : null}
            <BackLink href={backHref}>{backLabel}</BackLink>
          </div>
        }
      >
        {canViewRecordings
          ? "The host recording and session transcript are ready to play."
          : "The recording and transcript are available to the host from their dashboard."}
      </RoomStateCard>
    );
  }

  // Drafts are host-only; nobody else can enter until the host starts.
  if (room.status === "draft" && (!session || room.hostId !== session.user.id)) {
    return (
      <RoomStateCard
        title="The room has not started yet"
        action={<BackLink href={backHref}>{backLabel}</BackLink>}
      >
        The host opens this room before anyone can join. Ask them to start it, then reload this page.
      </RoomStateCard>
    );
  }

  // Signed-out visitor on a live room: guest join with a display name.
  if (!session) {
    return <GuestNameGate room={{ id: room.id, slug: room.slug, name: room.name }} />;
  }

  const membership = await getPrisma().roomParticipant.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: session.user.id } },
    select: { displayName: true, role: true },
  });

  const isHost = room.hostId === session.user.id;
  const role = parseRole(membership?.role) ?? (isHost ? "host" : "participant");

  return (
    <StudioRoom
      room={{ id: room.id, slug: room.slug, name: room.name }}
      viewer={{ name: membership?.displayName ?? session.user.name, role }}
    />
  );
}
