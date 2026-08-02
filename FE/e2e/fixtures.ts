import { test as base, expect, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLaporanAwal, uniqueMarker } from "./helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(__dirname, ".auth");

/** Saved signed-in sessions produced by `auth.setup.ts`. */
export const PETUGAS_STATE = path.join(authDir, "petugas.json");
export const ADMIN_STATE = path.join(authDir, "admin.json");
export const MANAGER_STATE = path.join(authDir, "manager.json");
export const MASTER_STATE = path.join(authDir, "master.json");

/** A report a test created, plus the marker that makes it findable in the UI. */
export interface CreatedReport {
  marker: string;
}

interface VoltFixtures {
  /** A page already authenticated as PETUGAS (field officer). */
  petugasPage: Page;
  /** A page already authenticated as ADMIN (validator). */
  adminPage: Page;
  /** A page already authenticated as MANAGER (read-only monitoring tier). */
  managerPage: Page;
  /** A page already authenticated as MASTER (system owner, full access). */
  masterPage: Page;
  /**
   * A freshly submitted Laporan Awal in PENDING state, created as petugas so the
   * validasi queue has a deterministic target. Yields the unique marker present
   * in the report's `pekerjaan` for locating its card.
   */
  pendingReport: CreatedReport;
}

/**
 * Test harness extended with role-scoped, pre-authenticated pages and a data
 * fixture. Each authed page runs in its own browser context built from the saved
 * storageState, so a single spec can drive both PETUGAS and ADMIN if needed.
 */
export const test = base.extend<VoltFixtures>({
  petugasPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: PETUGAS_STATE });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },

  adminPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: ADMIN_STATE });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },

  managerPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: MANAGER_STATE });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },

  masterPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: MASTER_STATE });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },

  pendingReport: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: PETUGAS_STATE });
    const page = await ctx.newPage();
    const marker = await createLaporanAwal(page, { marker: uniqueMarker("PEND") });
    await ctx.close();
    await use({ marker });
  },
});

export { expect };
