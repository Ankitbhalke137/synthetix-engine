"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import { authClient } from "@/lib/auth-client";
import { SignInSchema, SignUpSchema } from "@/lib/auth-schemas";

type Mode = "sign-in" | "sign-up";
type Field = "name" | "email" | "password";
type FieldErrors = Partial<Record<Field, string>>;

const COPY = {
  "sign-in": {
    title: "Welcome back",
    subtitle: "Sign in to open your studio.",
    submit: "Sign in",
    pending: "Signing in…",
    switchText: "New here?",
    switchAction: "Create an account",
  },
  "sign-up": {
    title: "Create your account",
    subtitle: "Rooms, captions and recordings — no downloads.",
    submit: "Create account",
    pending: "Creating account…",
    switchText: "Already have an account?",
    switchAction: "Sign in",
  },
} as const;

/** Only internal paths are honoured, so `?next=` can never redirect off-site. */
function nextDestination(): string {
  const next = new URLSearchParams(window.location.search).get("next");

  return next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of issues) {
    const field = issue.path[0];
    if ((field === "name" || field === "email" || field === "password") && !errors[field]) {
      errors[field] = issue.message;
    }
  }

  return errors;
}

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const copy = COPY[mode];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    const formData = new FormData(event.currentTarget);
    const values = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    const parsed =
      mode === "sign-up"
        ? SignUpSchema.safeParse(values)
        : SignInSchema.safeParse({ email: values.email, password: values.password });

    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error.issues));
      return;
    }

    setPending(true);

    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({
              name: values.name,
              email: values.email,
              password: values.password,
            })
          : await authClient.signIn.email({
              email: values.email,
              password: values.password,
            });

      if (result.error) {
        setFormError(result.error.message ?? "That did not work — please try again.");
        return;
      }

      router.replace(nextDestination());
      router.refresh();
    } catch {
      setFormError("Network error — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  function switchMode() {
    setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
    setErrors({});
    setFormError(null);
  }

  return (
    <div className="w-full max-w-sm rounded-panel border border-border bg-surface p-6 shadow-lg shadow-black/30">
      <h1 className="text-lg font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-1 text-sm text-text-muted">{copy.subtitle}</p>

      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {mode === "sign-up" ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "name-error" : undefined}
              className="h-11 rounded-panel border border-border bg-bg px-3 text-sm outline-none transition-colors focus:border-accent"
            />
            {errors.name ? (
              <p id="name-error" className="text-sm text-danger">
                {errors.name}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            className="h-11 rounded-panel border border-border bg-bg px-3 text-sm outline-none transition-colors focus:border-accent"
          />
          {errors.email ? (
            <p id="email-error" className="text-sm text-danger">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            required
            minLength={mode === "sign-up" ? 10 : undefined}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : "password-hint"}
            className="h-11 rounded-panel border border-border bg-bg px-3 text-sm outline-none transition-colors focus:border-accent"
          />
          <p id="password-hint" className="text-xs text-text-muted">
            {mode === "sign-up" ? "At least 10 characters." : "Use your account password."}
          </p>
          {errors.password ? (
            <p id="password-error" className="text-sm text-danger">
              {errors.password}
            </p>
          ) : null}
        </div>

        {formError ? (
          <p role="alert" className="rounded-panel border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-control bg-accent px-4 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? copy.pending : copy.submit}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-text-muted">
        {copy.switchText}{" "}
        <button
          type="button"
          onClick={switchMode}
          className="font-medium text-text underline decoration-border underline-offset-4 hover:decoration-accent"
        >
          {copy.switchAction}
        </button>
      </p>
    </div>
  );
}
