import { RoomsSkeleton } from "@/components/dashboard/RoomsSkeleton";

export default function DashboardLoading() {
  return (
    <div>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div aria-hidden className="h-8 w-40 animate-pulse rounded bg-surface-2" />
          <div aria-hidden className="mt-3 h-4 w-72 animate-pulse rounded bg-surface-2" />
        </div>
        <div aria-hidden className="h-11 w-full animate-pulse rounded-panel bg-surface-2 sm:max-w-sm" />
      </div>
      <RoomsSkeleton />
    </div>
  );
}
