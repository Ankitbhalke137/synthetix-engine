// Vitest runs outside the React Server Component bundler, where the real
// `server-only` package throws by design (it is a build-time guard).
// The vitest config aliases "server-only" to this no-op module.
export {};
