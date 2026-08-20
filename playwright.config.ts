import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    // `localhost` و نه `127.0.0.1`: سرورِ Next روی نامِ میزبان گوش می‌دهد و
    // در ویندوز این دو همیشه یکی resolve نمی‌شوند.
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "fa-IR",
    screenshot: "only-on-failure",
  },
});
