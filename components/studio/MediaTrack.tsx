"use client";

import { useEffect, useRef } from "react";
import type { Track } from "livekit-client";

/**
 * LiveKit tracks own their media elements: attach on mount/track change and
 * detach on cleanup. Keeping this in one place avoids leaking elements when
 * participants publish, unpublish or reconnect.
 */
export function AttachedVideo({ track, mirrored }: { track: Track; mirrored: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    track.attach(element);

    return () => {
      track.detach(element);
    };
  }, [track]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`h-full w-full object-cover ${mirrored ? "-scale-x-100" : ""}`}
    />
  );
}

export function AttachedAudio({ track }: { track: Track }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    track.attach(element);

    return () => {
      track.detach(element);
    };
  }, [track]);

  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}
