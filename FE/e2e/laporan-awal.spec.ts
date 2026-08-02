import { test, expect } from "./fixtures";
import { createLaporanAwal } from "./helpers";
import { T } from "./selectors";

/**
 * LAPORAN AWAL — the pre-work field report (petugas).
 *
 * Note: the "Simpan Draft" button in the toolbar is currently a no-op and the
 * "Autosaved…" line is static copy, so there is no real draft-persistence flow to
 * assert. We instead verify the autosave/draft affordance is present (adapted from
 * the requested "Save Draft" case) rather than assert behaviour that doesn't exist.
 */
test.describe("Laporan Awal", () => {
  test("creates and submits a report", async ({ petugasPage }) => {
    await createLaporanAwal(petugasPage);
    await expect(petugasPage).toHaveURL(/\/history/);
  });

  test("blocks submit with validation errors when empty", async ({ petugasPage }) => {
    await petugasPage.goto("/laporan-awal");
    await petugasPage.getByTestId(T.submitLaporanAwal).click();
    // Actual UX: Laporan Awal's `onInvalid` handler surfaces zod validation as a
    // SweetAlert summary dialog naming the first offending field — it does NOT
    // render inline `field-error` hints (unlike Laporan Akhir). The blocked
    // submit keeps us on the form.
    const dialog = petugasPage.getByRole("dialog", { name: /Form Belum Lengkap/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/wajib diisi/i);
    await expect(petugasPage).toHaveURL(/\/laporan-awal/);
  });

  test("shows the draft autosave affordance", async ({ petugasPage }) => {
    await petugasPage.goto("/laporan-awal");
    await expect(petugasPage.getByText(/Draft tersimpan otomatis/i)).toBeVisible();
    await expect(petugasPage.getByRole("button", { name: /Simpan Draft/i })).toBeVisible();
  });

  test("views a submitted report in History", async ({ petugasPage }) => {
    await createLaporanAwal(petugasPage);
    // Lands on /history; open the most recent report's detail.
    await petugasPage.getByTestId(T.historyDetailBtnDesktop).first().click();
    const dialog = petugasPage.getByTestId(T.historyDetailDialog);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Detail Laporan/i)).toBeVisible();
  });
});
