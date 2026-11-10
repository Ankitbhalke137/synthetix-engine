import Link from "next/link";

const FEATURES = [
  {
    title: "Multi-guest rooms",
    body: "WebRTC rooms on LiveKit's SFU — up to 9 tiles, active-speaker layout, role-aware controls.",
  },
  {
    title: "AI captions, live",
    body: "Voice-activity chunks stream through a server-side Groq Whisper proxy into a caption rail with speaker attribution.",
  },
  {
    title: "Record & replay",
    body: "Client-side recording uploads in parts to S3-compatible storage, then plays back with the transcript.",
  },
] as const;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <span className="text-sm font-semibold tracking-tight">Synthetix Engine</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="text-text-muted transition-colors hover:text-text">
            Dashboard
          </Link>
          <Link
            href="/login"
            className="rounded-control border border-border px-3 py-1.5 transition-colors hover:border-accent"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-20">
        <p className="font-mono text-xs tracking-[0.06em] text-text-muted uppercase">
          Free-tier stack · Next.js · LiveKit · Neon
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Your studio. Live in the browser.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-text-muted">
          Multi-guest video rooms with real-time AI captions and recordings — no downloads, no
          plugins, no monthly bill.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            className="rounded-control bg-accent px-5 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            Create a room
          </Link>
          <Link
            href="/dashboard"
            className="rounded-control border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-accent"
          >
            Open dashboard
          </Link>
        </div>

        <ul className="mt-16 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="rounded-panel border border-border bg-surface p-5">
              <h2 className="text-sm font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{feature.body}</p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-text-muted">
          <span>Portfolio build · captions and recording land in later phases</span>
          <a
            href="https://github.com/Ankitbhalke137/synthetix-engine"
            className="underline decoration-border underline-offset-4 hover:decoration-accent"
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
