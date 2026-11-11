"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FormEvent } from "react";

import { createRoomAction } from "@/app/actions/rooms";

export function NewRoomForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await createRoomAction(formData);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      form.reset();
      router.push(`/studio/${result.slug}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor="room-name">
        Room name
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="room-name"
          name="name"
          type="text"
          required
          minLength={3}
          maxLength={80}
          placeholder="Weekly design review"
          className="h-11 min-w-56 flex-1 rounded-panel border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-control bg-accent px-4 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "New room"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
