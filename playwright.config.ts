import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:44310",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node apps/server/dist/server.js",
    url: "http://127.0.0.1:44310/health",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    env: {
      HOST: "127.0.0.1",
      PORT: "44310",
      PUBLIC_ORIGIN: "http://127.0.0.1:44310",
      DATABASE_URL: "",
      ALLOW_REHEARSAL: "true",
      OFFLINE_INTERVAL_MS: "1000",
      OPENAI_API_KEY: "",
      OPENROUTER_API_KEY: "",
      AI_PROVIDER: "openai",
      AI_MODEL: "",
      OPENAI_MODEL: "",
      TWITCH_CLIENT_ID: "",
      TWITCH_CLIENT_SECRET: "",
    },
  },
});
