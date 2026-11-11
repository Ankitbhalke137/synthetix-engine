import type { Metadata } from "next";
import { Suspense } from "react";

import { NewRoomForm } from "@/components/dashboard/NewRoomForm";
import { RoomsList } from "@/components/dashboard/RoomsList";
import { RoomsSkeleton } from "@/components/dashboard/RoomsSkeleton";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your rooms</h1>
          <p className="mt-1 text-sm text-text-muted">Create a room, then invite guests from the studio.</p>
        </div>
        <div className="w-full sm:max-w-sm">
          <NewRoomForm />
        </div>
      </div>

      {/* Runtime data (session + DB) streams inside the static shell. */}
      <Suspense fallback={<RoomsSkeleton />}>
        <RoomsList />
      </Suspense>
    </div>
  );
}
