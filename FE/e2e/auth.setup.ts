import { test as setup } from "@playwright/test";
import { login, CREDENTIALS } from "./helpers";
import { PETUGAS_STATE, ADMIN_STATE, MANAGER_STATE, MASTER_STATE } from "./fixtures";

/**
 * Authentication setup project — runs once before the test suites and saves a
 * signed-in `storageState` per role to `e2e/.auth/*.json`. The feature specs then
 * reuse those sessions (see fixtures.ts), so they skip the login round-trip and
 * run faster while staying deterministic.
 *
 * The app keeps its tokens in localStorage (`voltreport-auth`, via the Zustand
 * `persist` middleware). `storageState` captures localStorage for the origin, so
 * restoring it re-hydrates the auth store on the next page load.
 */
setup("authenticate as petugas", async ({ page }) => {
  await login(page, CREDENTIALS.petugas);
  await page.context().storageState({ path: PETUGAS_STATE });
});

setup("authenticate as admin", async ({ page }) => {
  await login(page, CREDENTIALS.admin);
  await page.context().storageState({ path: ADMIN_STATE });
});

setup("authenticate as manager", async ({ page }) => {
  await login(page, CREDENTIALS.manager);
  await page.context().storageState({ path: MANAGER_STATE });
});

setup("authenticate as master", async ({ page }) => {
  // CREDENTIALS.superadmin is the seeded MASTER account (MASTER → superadmin tier).
  await login(page, CREDENTIALS.superadmin);
  await page.context().storageState({ path: MASTER_STATE });
});
