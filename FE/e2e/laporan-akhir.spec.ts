import { test, expect } from "./fixtures";
import { createLaporanAkhir, dismissSwal, ONE_PX_PNG } from "./helpers";
import { T } from "./selectors";

/**
 * LAPORAN AKHIR — the post-work field report with documentation upload (petugas).
 */
test.describe("Laporan Akhir", () => {
  test("creates a report with documentation and submits", async ({ petugasPage }) => {
    await createLaporanAkhir(petugasPage);
    await expect(petugasPage).toHaveURL(/\/history/);
  });

  test("attaches a documentation photo", async ({ petugasPage }) => {
    await petugasPage.goto("/laporan-akhir");
    await petugasPage.getByTestId(T.uploadDokumentasi).setInputFiles({
      name: "bukti-e2e.png",
      mimeType: "image/png",
      buffer: ONE_PX_PNG,
    });
    await dismissSwal(petugasPage);
    // The chosen file is listed in the upload zone summary.
    await expect(petugasPage.getByText("bukti-e2e.png").first()).toBeVisible();
  });

  test("blocks submit with validation errors when empty", async ({ petugasPage }) => {
    await petugasPage.goto("/laporan-akhir");
    await petugasPage.getByTestId(T.submitLaporanAkhir).click();
    await expect(petugasPage.getByTestId(T.fieldError).first()).toBeVisible();
    await expect(petugasPage).toHaveURL(/\/laporan-akhir/);
  });

  test("views a submitted report in History", async ({ petugasPage }) => {
    await createLaporanAkhir(petugasPage);
    await petugasPage.getByTestId(T.historyDetailBtnDesktop).first().click();
    await expect(petugasPage.getByTestId(T.historyDetailDialog)).toBeVisible();
  });
});
