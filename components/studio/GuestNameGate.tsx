"use client";

import { useState, type FormEvent } from "react";

import { StudioRoom } from "./StudioRoom";

/**
 * Guests (no account) pick the name other participants will see before the
 * pre-join device check. The name is sent to the token endpoint, which is the
 * only place it becomes an identity — it is never trusted as a role.
 */
export function GuestNameGate({
  room,
}: {
  room: { id: string; slug: string; name: string };
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joinedName, setJoinedName] = useState<string | null>(null);

  if (joinedName) {
    return (
      <StudioRoom
        room={room}
        viewer={{ name: joinedName, role: "participant" }}
        guestDisplayName={joinedName}
      />
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = name.trim();

    if (trimmed.length < 2) {
      setError("Enter at least 2 characters.");
      return;
    }

    setError(null);
    setJoinedName(trimmed);
  }

  return (
    <div className="grid h-dvh place-items-center bg-bg px-4">
      <div className="w-full max-w-md rounded-panel border border-border bg-surface p-6">
        <p className="font-mono text-[11px] tracking-[0.06em] text-text-muted uppercase">
          Joining as a guest
        </p>
        <h1 className="mt-1 text-lg font-semibold">{room.name}</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          No account needed. Tell the room who you are, then check your mic and camera.
        </p>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          <label htmlFor="guest-name" className="text-sm font-medium">
            Display name
          </label>
          <input
            id="guest-name"
            name="displayName"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            autoComplete="name"
            autoFocus
            aria-invalid={error !== null}
            aria-describedby={error ? "guest-name-error" : undefined}
            placeholder="e.g. Marcus"
            className="rounded-control border border-border bg-bg px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
          />
          {error ? (
            <p id="guest-name-error" role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="mt-1 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
