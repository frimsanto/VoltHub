import { test, expect } from "./fixtures";
import { T } from "./selectors";

/**
 * DASHBOARD — role-aware operational landing.
 *
 * PETUGAS sees the field dashboard (KPI cards + "Aktivitas Terbaru"); management
 * roles see the OverviewKpis band. Mobile rendering is covered in mobile.spec.
 * Pages are pre-authenticated via fixtures (no per-test login).
 */
test.describe("Dashboard", () => {
  test("loads the Petugas dashboard", async ({ petugasPage }) => {
    await petugasPage.goto("/dashboard");
    await expect(petugasPage).toHaveURL(/\/dashboard/);
    await expect(petugasPage.getByTestId(T.dashboardKpiCard).first()).toBeVisible();
  });

  test("shows KPI cards", async ({ petugasPage }) => {
    await petugasPage.goto("/dashboard");
    // The Petugas dashboard renders four headline KPI cards.
    await expect(petugasPage.getByTestId(T.dashboardKpiCard).first()).toBeVisible();
    expect(await petugasPage.getByTestId(T.dashboardKpiCard).count()).toBeGreaterThanOrEqual(4);
  });

  test("shows the recent activity section", async ({ petugasPage }) => {
    await petugasPage.goto("/dashboard");
    await expect(petugasPage.getByTestId(T.dashboardRecentActivity)).toBeVisible();
  });

  test("loads the management dashboard for Admin", async ({ adminPage }) => {
    await adminPage.goto("/dashboard");
    await expect(adminPage).toHaveURL(/\/dashboard/);
    // Management overview renders the multi-KPI band (registry/ops StatCards).
    await expect(adminPage.getByTestId(T.dashboardKpiCard).first()).toBeVisible();
  });
});
