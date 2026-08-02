import { test, expect, devices, type Browser, type Page } from "@playwright/test";
import { T } from "./selectors";

/**
 * MOBILE UX — runs only in the `mobile-chromium` project (Pixel-7 emulation,
 * pre-authenticated as PETUGAS via storageState). Uses the project's default
 * `page` so the device viewport/touch/UA are preserved (the fixture-based authed
 * pages would drop emulation).
 *
 * These assert the phone-only chrome: the 5-tab PetugasBottomNav (Beranda · WO ·
 * Laporan · GIS · Profil) and the GIS bottom sheets — none of which render at md+.
 */
test.describe("Mobile UX", () => {
  test("renders the dashboard with the bottom nav", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId(T.petugasBottomNav)).toBeVisible();
  });

  test("renders the GIS map with mobile controls and opens the Layers sheet", async ({ page }) => {
    await page.goto("/gis");
    await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(T.gisMobileLayers)).toBeVisible();
    await expect(page.getByTestId(T.gisMobileFilter)).toBeVisible();

    await page.getByTestId(T.gisMobileLayers).click();
    // The Layers bottom sheet exposes the per-layer toggles.
    await expect(page.getByTestId(T.gisLayerToggleMobile("gardu"))).toBeVisible();
  });

  test("navigates to Work Order via the bottom nav", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId(T.petugasBottomNav).getByRole("link", { name: "WO" }).click();
    await expect(page).toHaveURL(/\/work-order/);
  });

  test("renders Riwayat (history) on mobile", async ({ page }) => {
    await page.goto("/history");
    await expect(page).toHaveURL(/\/history/);
    await expect(page.getByRole("heading", { name: /History Laporan/i })).toBeVisible();
    await expect(page.getByTestId(T.petugasBottomNav)).toBeVisible();
  });

  test("renders the Profile page on mobile", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByTestId(T.profileSave)).toBeVisible();
    await expect(page.getByTestId(T.petugasBottomNav)).toBeVisible();
  });
});

/**
 * ROLE-ADAPTIVE NAV SHELL — the bottom bar (+ "Lainnya" overflow sheet) that
 * MASTER/MANAGER/ADMIN/NOC get on phones (components/mobile/MobileNavShell).
 *
 * These are HERMETIC: instead of a seeded login, each test builds its own context,
 * injects a stubbed session for the target role into localStorage, and stubs every
 * cross-origin (API) request so the fake session survives (a real backend would
 * 401 the fake token and bounce to /login). They therefore assert the PURE
 * role→shell mapping with no dependency on backend state or seeded accounts.
 *
 * The shell renders identically on every /_app route, so the light, data-independent
 * `/profile` is used as its host (avoids dashboard data-fetch flakiness).
 */
const APP_ORIGIN = new URL(process.env.E2E_BASE_URL || "http://localhost:5173").origin;
const RTUPP5 = { id: "r5", code: "RTUPP5", name: "RTUPP 5" };

type Rtupp = { id: string; code: string; name: string } | null;

/** The persisted (localStorage) shape the auth store hydrates from. `role` is the
 *  already-normalized frontend value (e.g. MASTER persists as `superadmin`). */
function persistedAuth(storeRole: string, rtupp: Rtupp): string {
  const user = {
    id: `verify-${storeRole}`,
    name: `Verify ${storeRole}`,
    email: `zz-verify-${storeRole}@voltreport.local`,
    phone: null,
    role: storeRole,
    avatar: null,
    isActive: true,
    mustChangePassword: false,
    rtupp,
    team: null,
  };
  return JSON.stringify({
    state: {
      user,
      accessToken: "stub-access",
      refreshToken: "stub-refresh",
      isAuthed: true,
      theme: "dark",
      sidebarCollapsed: false,
    },
    version: 0,
  });
}

/**
 * Build a context authenticated as `storeRole` with all API traffic stubbed, then
 * open `/profile`. `mobile` picks Pixel-7 emulation (<md, shell shows) vs a 1440
 * desktop viewport (≥md, shell hidden). Caller owns closing the context.
 */
async function openAs(
  browser: Browser,
  opts: { storeRole: string; rtupp?: Rtupp; mobile?: boolean },
) {
  const { storeRole, rtupp = null, mobile = true } = opts;
  const ctx = await browser.newContext(
    mobile ? { ...devices["Pixel 7"] } : { viewport: { width: 1440, height: 900 } },
  );
  const state = persistedAuth(storeRole, rtupp);
  const user = JSON.parse(state).state.user;
  // Stub every cross-origin request (the API on :3001) — NOT the app origin, whose
  // /src/lib/api/*.ts source modules would otherwise be served as JSON and blank
  // the app. Empty payloads default to `[]` so pages that `.map()` don't crash.
  await ctx.route(
    (url) => url.origin !== APP_ORIGIN,
    (route) => {
      const u = route.request().url();
      let body: unknown = { success: true, data: [] };
      if (u.includes("/auth/profile") || u.includes("/auth/me")) {
        body = { success: true, data: { user } };
      } else if (u.includes("/auth/refresh")) {
        body = { success: true, data: { accessToken: "stub2", refreshToken: "stub2" } };
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
  await ctx.addInitScript(
    (arg: [string, string]) => window.localStorage.setItem(arg[0], arg[1]),
    ["voltreport-auth", state],
  );
  const page = await ctx.newPage();
  await page.goto(`${APP_ORIGIN}/profile`, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}

/** Uppercased section-header labels rendered inside the open More sheet. */
async function moreSheetHeaders(sheet: ReturnType<Page["getByTestId"]>): Promise<string[]> {
  const texts = await sheet.locator("div.uppercase").allInnerTexts();
  return texts.map((t) => t.trim().toUpperCase());
}

test.describe("Mobile nav shell (role-adaptive)", () => {
  test("NOC → 4 tabs, no Lainnya slot", async ({ browser }) => {
    const { ctx, page } = await openAs(browser, { storeRole: "noc" });
    const shell = page.getByTestId(T.mobileNavShell);
    await expect(shell).toBeVisible();
    await expect(shell.locator("a, button")).toHaveCount(4);
    await expect(shell.getByText("Dashboard")).toBeVisible();
    await expect(shell.getByText("Upload")).toBeVisible();
    await expect(shell.getByText("Lainnya")).toHaveCount(0);
    await expect(page.getByTestId(T.petugasBottomNav)).toHaveCount(0);
    await ctx.close();
  });

  test("ADMIN → 5 tabs, More sheet has Manajemen + Data & Tools", async ({ browser }) => {
    const { ctx, page } = await openAs(browser, { storeRole: "admin", rtupp: RTUPP5 });
    const shell = page.getByTestId(T.mobileNavShell);
    await expect(shell).toBeVisible();
    await expect(shell.locator("a, button")).toHaveCount(5);
    await shell.getByRole("button", { name: "Lainnya" }).click();
    const sheet = page.getByTestId(T.mobileMoreSheet);
    await expect(sheet).toBeVisible();
    const headers = await moreSheetHeaders(sheet);
    expect(headers).toContain("MANAJEMEN");
    expect(headers).toContain("DATA & TOOLS");
    await ctx.close();
  });

  test("MANAGER → 5 tabs, More sheet without Manajemen/Sistem", async ({ browser }) => {
    const { ctx, page } = await openAs(browser, { storeRole: "manager", rtupp: RTUPP5 });
    const shell = page.getByTestId(T.mobileNavShell);
    await expect(shell).toBeVisible();
    await expect(shell.locator("a, button")).toHaveCount(5);
    await shell.getByRole("button", { name: "Lainnya" }).click();
    const sheet = page.getByTestId(T.mobileMoreSheet);
    await expect(sheet).toBeVisible();
    const headers = await moreSheetHeaders(sheet);
    // Sanity: the sheet actually populated (read-only monitoring still sees these).
    expect(headers).toContain("MASTER DATA");
    // But MANAGER is read-only: no user management, no system section.
    expect(headers).not.toContain("MANAJEMEN");
    expect(headers).not.toContain("SISTEM");
    await ctx.close();
  });

  test("MASTER → 5 tabs, More sheet has Sistem section", async ({ browser }) => {
    const { ctx, page } = await openAs(browser, { storeRole: "superadmin" });
    const shell = page.getByTestId(T.mobileNavShell);
    await expect(shell).toBeVisible();
    await expect(shell.locator("a, button")).toHaveCount(5);
    await shell.getByRole("button", { name: "Lainnya" }).click();
    const sheet = page.getByTestId(T.mobileMoreSheet);
    await expect(sheet).toBeVisible();
    const headers = await moreSheetHeaders(sheet);
    expect(headers).toContain("SISTEM");
    await ctx.close();
  });

  test("PETUGAS → PetugasBottomNav shown, MobileNavShell absent", async ({ browser }) => {
    const { ctx, page } = await openAs(browser, { storeRole: "petugas", rtupp: RTUPP5 });
    await expect(page.getByTestId(T.petugasBottomNav)).toBeVisible();
    await expect(page.getByTestId(T.mobileNavShell)).toHaveCount(0);
    await ctx.close();
  });

  test("Desktop @1440 → no mobile shell for any role", async ({ browser }) => {
    for (const storeRole of ["superadmin", "manager", "admin", "noc", "petugas"]) {
      const { ctx, page } = await openAs(browser, { storeRole, rtupp: RTUPP5, mobile: false });
      // Desktop sidebar is present; neither bottom nav is visible at ≥md.
      await expect(page.locator("aside").first()).toBeVisible();
      await expect(page.getByTestId(T.mobileNavShell)).toBeHidden();
      await expect(page.getByTestId(T.petugasBottomNav)).toBeHidden();
      await ctx.close();
    }
  });
});
