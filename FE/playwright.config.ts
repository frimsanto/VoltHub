import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Playwright E2E config for VoltHub.
 *
 * Requirements to run:
 *   1. Backend API running (default http://localhost:3001) with a seeded DB
 *      (`npm run seed` in BE/ creates the default users; reset-roles seeds the
 *      MASTER/MANAGER/ADMIN/PETUGAS accounts with password `Volthub123!`).
 *   2. Frontend dev/preview server — Playwright starts it automatically via the
 *      `webServer` block unless E2E_BASE_URL points at an already-running app.
 *
 * Project graph:
 *   • setup            → logs in each role once, writes e2e/.auth/*.json
 *   • chromium         → desktop suites (everything except the mobile spec),
 *                        depends on setup; specs pull pre-authed pages from
 *                        fixtures (auth.spec stays on a fresh, un-authed page)
 *   • mobile-chromium  → mobile.spec only, Pixel-7 emulation, runs pre-authed as
 *                        PETUGAS via storageState, depends on setup
 *   • mobile-shell-stubbed → the role-adaptive nav-shell tests in mobile.spec
 *                        (scoped by `grep`), Pixel-5, NO setup dependency. Those
 *                        tests inject their own stubbed auth + stub the API, so
 *                        they are hermetic and run WITHOUT a backend — letting CI
 *                        exercise the role-gating independently of backend uptime.
 *
 * Credentials are read from env so CI can inject real test accounts; they
 * default to the seeded demo users.
 */
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PETUGAS_STATE = path.join(__dirname, "e2e", ".auth", "petugas.json");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Capture a screenshot + video only when a test fails.
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // The mobile suite runs in its own emulated project; the setup file is the
      // setup project's job.
      testIgnore: [/auth\.setup\.ts/, /mobile\.spec\.ts/],
      dependencies: ["setup"],
    },
    {
      name: "mobile-chromium",
      // Pixel 7 viewport + touch + mobile UA so the app renders its phone chrome
      // (bottom tab bar, FAB, GIS sheets). Pre-authenticated as PETUGAS.
      use: { ...devices["Pixel 7"], storageState: PETUGAS_STATE },
      testMatch: /mobile\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      // Hermetic role-gating tests: fully self-contained (each injects a stubbed
      // session + stubs the API), so they need NO backend and NO `setup`.
      // `grep` scopes this project to the "Mobile nav shell (role-adaptive)"
      // describe block — the other, backend-dependent "Mobile UX" tests in the
      // same file stay exclusive to mobile-chromium (which is left untouched).
      name: "mobile-shell-stubbed",
      use: { ...devices["Pixel 5"] },
      testMatch: /mobile\.spec\.ts/,
      grep: /role-adaptive/,
      // no dependencies — no auth.setup, no storageState.
    },
  ],
  // Auto-start the FE preview server unless pointed at an external URL.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
