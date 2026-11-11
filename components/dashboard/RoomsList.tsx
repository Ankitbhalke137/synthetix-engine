import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { RoomCard } from "@/components/dashboard/RoomCard";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * Runtime data (session cookie + Prisma) lives here, inside the page's
 * Suspense boundary — Cache Components forbids blocking the static shell.
 */
export async function RoomsList() {
  const session = await getSession(await headers());

  if (!session) {
    redirect("/login");
  }

  const rooms = await getPrisma().room.findMany({
    where: { hostId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      createdAt: true,
      _count: { select: { participants: true } },
    },
  });

  if (rooms.length === 0) {
    return (
      <p className="mt-8 rounded-panel border border-dashed border-border bg-surface px-5 py-10 text-center text-sm text-text-muted">
        No rooms yet — create your first room above.
      </p>
    );
  }

  return (
    <ul className="mt-8 grid gap-3 sm:grid-cols-2">
      {rooms.map((room) => (
        <li key={room.id}>
          <RoomCard
            id={room.id}
            slug={room.slug}
            name={room.name}
            status={room.status}
            createdAt={room.createdAt}
            participants={room._count.participants}
          />
        </li>
      ))}
    </ul>
  );
}
