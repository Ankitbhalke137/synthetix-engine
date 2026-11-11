"use client";

import { useState } from "react";

/**
 * Copies an absolute invite URL to the clipboard. The URL is derived from the
 * current origin at click time (never at render), so preview deployments and
 * custom domains both produce a link that actually works.
 */
export function CopyLinkButton({
  path,
  label = "Copy invite link",
  copiedLabel = "Link copied",
  className,
}: {
  path: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = new URL(path, window.location.origin).toString();

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API needs HTTPS + permission; fall back to a prompt so the
      // host can still copy the link manually.
      window.prompt("Copy this invite link", url);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-live="polite"
      className={
        className ??
        "rounded-control border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent"
      }
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
