/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The backend owns /api and /auth. Proxying them keeps session cookies same-origin in development.
const backend = process.env.AFTERLIFE_BACKEND ?? "http://127.0.0.1:4310";
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: backend },
      "/auth": { target: backend },
      "/health": { target: backend },
    },
    // Fixtures live in docs/afterlife/fixtures, outside this workspace.
    fs: { allow: [repositoryRoot] },
  },
  build: { outDir: "dist", sourcemap: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    css: false,
  },
});
