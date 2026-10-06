import { defineConfig, devices } from "@playwright/test";

// Synthetic data only. No auth-state files are written: every test signs in
// through the UI. Traces can contain request bodies, so they are opt-in.
export default defineConfig({
  testDir: "./playwright/tests",
  testMatch: "**/*.pw.ts",
  outputDir: "./test-results/playwright",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    locale: "en-US",
    trace: process.env.PLAYWRIGHT_TRACE === "1" ? "retain-on-failure" : "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
