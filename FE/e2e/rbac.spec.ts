import fs from "node:fs";
import { type Page } from "@playwright/test";
import { test, expect, PETUGAS_STATE } from "./fixtures";
import { login, logout, CREDENTIALS } from "./helpers";

/**
 * RBAC & ROUTE GUARDS — the access-control boundary, asserted by *direct URL
 * navigation* (not just hidden nav), so a hand-typed/deep-linked URL is proven to
 * be enforced. Mirrors the guard model in `lib/v2/route-guards.ts` + `lib/route-
 * guards.ts`:
 *
 *   • V2 guards (requireV2Role / requireV2Capability) deny → /unauthorized
 *   • V1 guards (requireRole)                          deny → /dashboard
 *   • any unauthenticated hit (auth is checked first)  deny → /login
 *
 * FE roles are normalised (stores/auth.normalizeRole): MASTER→superadmin,
 * MANAGER→manager, ADMIN→admin, PETUGAS→petugas.
 */

// Deny-redirect targets by guard family.
const UNAUTHORIZED = /\/unauthorized/;
const DASHBOARD = /\/dashboard/;
const LOGIN = /\/login/;

/**
 * Navigate to `path` and assert where the guards land us. A guard redirect can
 * abort the in-flight navigation (net::ERR_ABORTED) — that's expected, so we
 * swallow the goto error and assert the *resulting* URL (which still fails the
 * test if we don't end up where we should).
 */
async function landsOn(page: Page, path: string, expected: RegExp): Promise<void> {
  await page.goto(path).catch(() => {});
  await expect(page).toHaveURL(expected);
}

/** A route the role is allowed to open lands on the route itself. */
function allowPattern(path: string): RegExp {
  return new RegExp(path.replace(/[/]/g, "\\/"));
}

// ── PETUGAS (field officer) ──────────────────────────────────────────────────
test.describe("RBAC · PETUGAS", () => {
  // [path, expected redirect, human label]
  const denied: Array<[string, RegExp, string]> = [
    ["/validasi", UNAUTHORIZED, "validation queue (admin-tier)"],
    ["/users", UNAUTHORIZED, "user management"],
    ["/rtupp", UNAUTHORIZED, "system settings (master-only)"],
    ["/asset", UNAUTHORIZED, "asset registry (ops)"],
    ["/imports", UNAUTHORIZED, "data import (admin-tier)"],
    ["/rekap", DASHBOARD, "rekap export (legacy V1 admin guard)"],
  ];
  for (const [path, expected, label] of denied) {
    test(`cannot access ${label} → ${path}`, async ({ petugasPage }) => {
      await landsOn(petugasPage, path, expected);
    });
  }

  test("keeps access to its own report entry (/laporan-awal)", async ({ petugasPage }) => {
    await landsOn(petugasPage, "/laporan-awal", allowPattern("/laporan-awal"));
  });
});

// ── ADMIN (operational hub) ──────────────────────────────────────────────────
test.describe("RBAC · ADMIN", () => {
  const allowed: Array<[string, string]> = [
    ["/validasi", "validation queue"],
    ["/users", "user management"],
    ["/imports", "data import"],
    ["/rekap", "rekap export"],
  ];
  for (const [path, label] of allowed) {
    test(`can access ${label} → ${path}`, async ({ adminPage }) => {
      await landsOn(adminPage, path, allowPattern(path));
    });
  }

  // ADMIN is not the system owner and not a field officer.
  test("cannot access system settings (/rtupp, master-only)", async ({ adminPage }) => {
    await landsOn(adminPage, "/rtupp", UNAUTHORIZED);
  });
  test("cannot open the field-officer report form (/laporan-awal)", async ({ adminPage }) => {
    await landsOn(adminPage, "/laporan-awal", UNAUTHORIZED);
  });
});

// ── MANAGER (read-only monitoring) ───────────────────────────────────────────
test.describe("RBAC · MANAGER (read-only)", () => {
  // Read visibility into management/ops pages.
  const readable: Array<[string, string]> = [
    ["/users", "user management (view)"],
    ["/asset", "asset registry (view)"],
  ];
  for (const [path, label] of readable) {
    test(`can view ${label} → ${path}`, async ({ managerPage }) => {
      await landsOn(managerPage, path, allowPattern(path));
    });
  }

  // No write/admin operations, no report creation, no system settings.
  const denied: Array<[string, string]> = [
    ["/validasi", "approve/reject reports"],
    ["/imports", "run data imports"],
    ["/laporan-awal", "create field reports"],
    ["/rtupp", "system settings"],
  ];
  for (const [path, label] of denied) {
    test(`cannot ${label} → ${path}`, async ({ managerPage }) => {
      await landsOn(managerPage, path, UNAUTHORIZED);
    });
  }
});

// ── MASTER (system owner — full access) ──────────────────────────────────────
test.describe("RBAC · MASTER (full access)", () => {
  // One route per guard tier proves end-to-end access.
  const allowed: Array<[string, string]> = [
    ["/validasi", "admin-tier (validation)"],
    ["/users", "user-mgmt"],
    ["/rtupp", "master-only (system settings)"],
    ["/teams", "master-only (teams)"],
    ["/rekap", "legacy V1 admin (rekap)"],
    ["/team", "legacy V1 superadmin (team)"],
  ];
  for (const [path, label] of allowed) {
    test(`has access to ${label} → ${path}`, async ({ masterPage }) => {
      await landsOn(masterPage, path, allowPattern(path));
    });
  }
});

// ── Route guards · unauthenticated ───────────────────────────────────────────
test.describe("Route guards · unauthenticated", () => {
  // `page` here is the project default (no storageState) → a signed-out browser.
  const protectedRoutes: Array<[string, string]> = [
    ["/dashboard", "the parent _app auth gate"],
    ["/validasi", "a V2 role-guarded route"],
    ["/rekap", "a V1 role-guarded route"],
  ];
  for (const [path, label] of protectedRoutes) {
    test(`requires login for ${label} (${path})`, async ({ page }) => {
      await landsOn(page, path, LOGIN);
    });
  }
});

// ── Route guards · session integrity ─────────────────────────────────────────
test.describe("Route guards · session integrity", () => {
  test("an expired session (API 401 + failed refresh) is forced to login", async ({
    petugasPage,
  }) => {
    // Simulate an expired session: every backend call — including the token
    // refresh — returns 401, so the axios interceptor (lib/api/client.ts) logs
    // out and hard-redirects to /login.
    //
    // The API is cross-origin (5173 → 3001), so the faked 401 MUST carry CORS
    // headers or the browser blocks it and axios sees a network error (no
    // `error.response.status`), bypassing the 401 branch. The app's custom
    // headers also provoke a CORS preflight, which we answer with 204.
    // Wildcard CORS — these requests are non-credentialed (auth rides in the
    // Authorization header, not cookies), so `*` covers origin/headers/methods
    // for both the preflight and the actual 401.
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Allow-Headers": "*",
    };
    // Scope strictly to the BACKEND origin — a loose `/api/` match also catches
    // Vite's dev source modules (…:5173/src/lib/api/*.ts) and breaks the app's JS.
    await petugasPage.route(/localhost:3001\/api\//, (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers: cors, body: "" });
      }
      return route.fulfill({
        status: 401,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "token expired" }),
      });
    });
    // /history fetches its report list on mount (useReports → apiClient), so the
    // 401 → failed-refresh → forced-logout cascade fires reliably.
    await petugasPage.goto("/history").catch(() => {});
    await expect(petugasPage).toHaveURL(LOGIN, { timeout: 15_000 });
  });

  test("an unrecognised role falls back to least privilege", async ({ browser }) => {
    // Tamper a valid PETUGAS session so the stored role is an unknown string.
    // toV2Role() must fall back to PETUGAS (least privilege), so an admin-tier
    // route is denied to /unauthorized rather than served.
    const state = JSON.parse(fs.readFileSync(PETUGAS_STATE, "utf-8"));
    for (const origin of state.origins ?? []) {
      const entry = (origin.localStorage ?? []).find(
        (l: { name: string }) => l.name === "voltreport-auth",
      );
      if (!entry) continue;
      const parsed = JSON.parse(entry.value);
      parsed.state.user.role = "WAREHOUSE_OVERLORD"; // not in the role set
      entry.value = JSON.stringify(parsed);
    }
    const ctx = await browser.newContext({ storageState: state });
    const page = await ctx.newPage();
    await page.goto("/validasi");
    await expect(page).toHaveURL(UNAUTHORIZED);
    await ctx.close();
  });

  test("logout invalidates the session for direct URL access", async ({ page }) => {
    await login(page, CREDENTIALS.petugas);
    await logout(page);
    // A deep link to a protected route after logout bounces to /login. The guard
    // redirect can abort the navigation (ERR_ABORTED) — tolerate it, assert URL.
    await page.goto("/dashboard").catch(() => {});
    await expect(page).toHaveURL(LOGIN);
  });
});
