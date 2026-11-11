import { Suspense } from "react";

import { StudioLoader } from "@/components/studio/StudioLoader";
import { StudioSkeleton } from "@/components/studio/StudioSkeleton";

export default async function StudioPage({ params }: PageProps<"/studio/[roomSlug]">) {
  const { roomSlug } = await params;

  return (
    <Suspense fallback={<StudioSkeleton />}>
      <StudioLoader roomSlug={roomSlug} />
    </Suspense>
  );
}
