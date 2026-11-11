"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { Role } from "@/lib/room-policy";
import { avatarColor, initials } from "./avatar";
import { ROLE_LABEL } from "./labels";
import type { StudioPreferences } from "./useStudioRoom";

type PreviewState = "requesting" | "ready" | "denied";

/**
 * Pre-join device check: request media once for a local preview, let the guest
 * choose mic/camera, then hand the choice to the session. The preview stream is
 * stopped before joining, so only LiveKit publishes.
 */
export function PrejoinScreen({
  room,
  viewer,
  onJoin,
}: {
  room: { slug: string; name: string };
  viewer: { name: string; role: Role };
  onJoin: (preferences: StudioPreferences) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<PreviewState>("requesting");
  const [attempt, setAttempt] = useState(0);
  const [microphone, setMicrophone] = useState(true);
  const [camera, setCamera] = useState(true);

  useEffect(() => {
    let disposed = false;

    async function startPreview() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setState("ready");
      } catch {
        if (!disposed) setState("denied");
      }
    }

    void startPreview();

    return () => {
      disposed = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    if (state === "ready" && camera && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [state, camera]);

  function toggleMicrophone() {
    setMicrophone((current) => {
      const next = !current;
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
      return next;
    });
  }

  function toggleCamera() {
    setCamera((current) => {
      const next = !current;
      streamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = next;
      });
      return next;
    });
  }

  function retryPreview() {
    setMicrophone(true);
    setCamera(true);
    setState("requesting");
    setAttempt((current) => current + 1);
  }

  const showPreview = state === "ready" && camera;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <Link href="/dashboard" className="text-sm font-semibold tracking-tight hover:text-accent">
          Synthetix Engine
        </Link>
        <Link
          href="/dashboard"
          className="text-sm text-text-muted transition-colors hover:text-text"
        >
          Back to dashboard
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="grid w-full max-w-4xl gap-6 rounded-panel border border-border bg-surface p-5 sm:p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-8">
          <div>
            <div className="relative aspect-video overflow-hidden rounded-panel border border-border bg-black">
              {showPreview ? (
                <video
                  ref={videoRef}
                  aria-label="Camera preview"
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full -scale-x-100 object-cover"
                />
              ) : state === "ready" ? (
                <div className="grid h-full place-items-center">
                  <span
                    aria-hidden
                    className="grid size-20 place-items-center rounded-full font-mono text-xl font-semibold"
                    style={{ backgroundColor: avatarColor(viewer.name) }}
                  >
                    {initials(viewer.name)}
                  </span>
                </div>
              ) : (
                <div className="grid h-full place-items-center px-6 text-center">
                  <p className="text-sm text-text-muted">
                    {state === "denied"
                      ? "Camera preview unavailable."
                      : "Requesting camera and microphone…"}
                  </p>
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-text-muted" aria-live="polite">
              {state === "denied"
                ? "Permission was blocked. You can retry or join without devices."
                : state === "ready"
                  ? camera
                    ? "Preview is local only — nothing is sent until you join."
                    : "Camera is off for this preview."
                  : "Allow access to check how you look and sound."}
            </p>
          </div>

          <div className="flex flex-col">
            <p className="font-mono text-[11px] tracking-[0.06em] text-text-muted uppercase">
              Pre-join check
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{room.name}</h1>
            <p className="mt-1 text-sm text-text-muted">
              Joining as {viewer.name} · {ROLE_LABEL[viewer.role]}
            </p>

            {state === "denied" ? (
              <div className="mt-5 rounded-panel border border-danger/40 bg-danger/10 p-3">
                <p className="text-sm">
                  Camera or microphone access is blocked. Allow it in your browser&apos;s site
                  settings, then retry.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={retryPreview}
                    className="rounded-control border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => onJoin({ microphone: false, camera: false })}
                    className="rounded-control border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent"
                  >
                    Join without devices
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-2">
                <DeviceToggle
                  label="Microphone"
                  checked={microphone}
                  onChange={toggleMicrophone}
                  disabled={state !== "ready"}
                />
                <DeviceToggle
                  label="Camera"
                  checked={camera}
                  onChange={toggleCamera}
                  disabled={state !== "ready"}
                />
              </div>
            )}

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={() =>
                  onJoin(
                    state === "denied"
                      ? { microphone: false, camera: false }
                      : { microphone, camera },
                  )
                }
                disabled={state === "requesting"}
                className="h-11 w-full rounded-control bg-accent px-4 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {state === "requesting" ? "Preparing…" : "Join room"}
              </button>
              <Link
                href="/dashboard"
                className="mt-2 block rounded-control border border-border px-4 py-2 text-center text-sm font-medium transition-colors hover:border-accent"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function DeviceToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className="flex items-center justify-between gap-3 rounded-panel border border-border bg-bg px-3 py-2.5 text-sm transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span>{label}</span>
      <span
        aria-hidden
        className={`relative h-5 w-9 shrink-0 rounded-control transition-colors ${
          checked ? "bg-accent" : "bg-surface-2"
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-bg transition-transform duration-150 ease-out ${
            checked ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="sr-only">{checked ? "on" : "off"}</span>
    </button>
  );
}
