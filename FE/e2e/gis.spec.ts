import { test, expect } from "./fixtures";
import { T } from "./selectors";

/**
 * GIS — operational map (desktop control card). PETUGAS has read-only access, so
 * the pre-authed petugasPage is sufficient.
 *
 * Map content depends on geocoded seed data. The backend seed
 * (BE/prisma/seed-gis-e2e.ts, run by `npm run seed` / `npm run reset:roles`)
 * provisions deterministic fixtures under the PETUGAS tenant: three geocoded
 * sites in central Jakarta, all sharing the Wilayah/UP3 region
 * "UP3 Jakarta Pusat (E2E)" and named "Gardu …". Those fixtures let the Wilayah
 * filter and the search-to-detail-panel tests assert real behaviour instead of
 * self-skipping.
 */
test.describe("GIS", () => {
  test.beforeEach(async ({ petugasPage }) => {
    await petugasPage.goto("/gis");
    await expect(petugasPage).toHaveURL(/\/gis/);
    // Leaflet has mounted once its container exists.
    await expect(petugasPage.locator(".leaflet-container")).toBeVisible({ timeout: 15_000 });
  });

  test("opens the map with the control card", async ({ petugasPage }) => {
    await expect(petugasPage.getByTestId(T.gisSearchDesktop)).toBeVisible();
  });

  test("searches for a Gardu", async ({ petugasPage }) => {
    const search = petugasPage.getByTestId(T.gisSearchDesktop);
    await search.fill("Gardu");
    await expect(search).toHaveValue("Gardu");
    // Debounced query fires; the map must stay mounted (no crash on search).
    await expect(petugasPage.locator(".leaflet-container")).toBeVisible();
  });

  test("searches for an Asset (asset layer)", async ({ petugasPage }) => {
    // Asset layer is off by default — enable it so an asset search has a layer.
    const assetToggle = petugasPage.getByTestId(T.gisLayerToggleDesktop("asset"));
    await assetToggle.click();
    await expect(assetToggle).toHaveAttribute("data-state", "checked");

    const search = petugasPage.getByTestId(T.gisSearchDesktop);
    await search.fill("RTU");
    await expect(search).toHaveValue("RTU");
    await expect(petugasPage.locator(".leaflet-container")).toBeVisible();
  });

  test("toggles a map layer off and on", async ({ petugasPage }) => {
    const gardu = petugasPage.getByTestId(T.gisLayerToggleDesktop("gardu"));
    // Gardu defaults ON.
    await expect(gardu).toHaveAttribute("data-state", "checked");
    await gardu.click();
    await expect(gardu).toHaveAttribute("data-state", "unchecked");
    await gardu.click();
    await expect(gardu).toHaveAttribute("data-state", "checked");
  });

  test("applies the work-order status filter", async ({ petugasPage }) => {
    const wo = petugasPage.getByTestId(T.gisFilterStatus);
    await wo.click();
    // Becomes the active (default-variant) button.
    await expect(wo).toHaveClass(/bg-primary/);
  });

  test("filters by Wilayah", async ({ petugasPage }) => {
    // The Wilayah select renders once the loaded sites yield ≥1 region — the
    // seed guarantees "UP3 Jakarta Pusat (E2E)" is present.
    const wilayah = petugasPage.getByTestId(T.gisFilterWilayah);
    await expect(wilayah).toBeVisible({ timeout: 15_000 });
    await wilayah.click();
    const option = petugasPage.getByRole("option").nth(1); // first real region (0 = "Semua")
    await option.click();
    await expect(petugasPage.locator(".leaflet-container")).toBeVisible();
  });

  test("opens a site detail panel via search", async ({ petugasPage }) => {
    // A matching search flies to the top result and auto-opens its detail panel.
    // The seed guarantees sites named "Gardu …" exist for the PETUGAS tenant.
    await petugasPage.getByTestId(T.gisSearchDesktop).fill("Gardu");
    const panel = petugasPage.getByTestId(T.gisDetailPanel);
    await expect(panel).toBeVisible({ timeout: 15_000 });
  });
});
