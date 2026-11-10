import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      // Vitest runs outside the React Server Component bundler, where the
      // real `server-only` package throws by design.
      "server-only": path.resolve(import.meta.dirname, "tests/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
