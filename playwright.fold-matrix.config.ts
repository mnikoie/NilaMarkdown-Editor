import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: ["outline-fold.spec.ts", "real-document-fold.spec.ts"],
  timeout: 180_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 5,
  reporter: [["list"]],
  outputDir: "test-results/fold-matrix",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "fa-IR",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], browserName: "chromium" },
    },
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], browserName: "chromium", channel: "chrome" },
    },
    {
      name: "edge",
      use: { ...devices["Desktop Edge"], browserName: "chromium", channel: "msedge" },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], browserName: "firefox" },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], browserName: "webkit" },
    },
  ],
});
