import { test, expect } from "./fixtures";
import { createLaporanAwal } from "./helpers";
import { T } from "./selectors";

/**
 * RIWAYAT — the petugas report history (archive, filters, detail).
 */
test.describe("Riwayat", () => {
  test("opens the history page", async ({ petugasPage }) => {
    await petugasPage.goto("/history");
    await expect(petugasPage).toHaveURL(/\/history/);
    await expect(petugasPage.getByRole("heading", { name: /History Laporan/i })).toBeVisible();
  });

  test("filters by search term (URL-synced)", async ({ petugasPage }) => {
    await petugasPage.goto("/history");
    await petugasPage.getByPlaceholder(/Cari ID, petugas, lokasi/i).fill("GD-E2E");
    // The filter is reflected into the URL (?search=…) so links are shareable.
    await expect(petugasPage).toHaveURL(/search=GD-E2E/);
  });

  test("opens a report detail dialog", async ({ petugasPage }) => {
    // Guarantee at least one row exists, then open its detail.
    await createLaporanAwal(petugasPage);
    await petugasPage.getByTestId(T.historyDetailBtnDesktop).first().click();
    await expect(petugasPage.getByTestId(T.historyDetailDialog)).toBeVisible();
  });
});
