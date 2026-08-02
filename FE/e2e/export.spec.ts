import { test, expect } from "./fixtures";
import { T } from "./selectors";

/**
 * EXPORT — Rekap (Rekap Awal) spreadsheet export.
 *
 * Note: the Rekap grid exports XLSX only (templates: Standard / K3 / Lengkap /
 * Current). There is no PDF export on this screen — PDF generation lives in the
 * separate Report Generator (Download Center). The requested "Export PDF" case is
 * therefore covered here as a second XLSX template export (K3) rather than a
 * non-existent PDF button.
 */
test.describe("Export Rekap", () => {
  test("exports the Standard template as XLSX", async ({ adminPage }) => {
    await adminPage.goto("/rekap");
    await expect(adminPage).toHaveURL(/\/rekap/);
    await adminPage.getByTestId(T.exportRekap).click();
    const [download] = await Promise.all([
      adminPage.waitForEvent("download", { timeout: 20_000 }),
      adminPage.getByTestId(T.exportRekapStandard).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
  });

  test("exports the K3 template as XLSX", async ({ adminPage }) => {
    await adminPage.goto("/rekap");
    await adminPage.getByTestId(T.exportRekap).click();
    const [download] = await Promise.all([
      adminPage.waitForEvent("download", { timeout: 20_000 }),
      adminPage.getByRole("menuitem", { name: /K3/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
  });

  test("exports gracefully when the dataset is empty", async ({ adminPage }) => {
    await adminPage.goto("/rekap");
    // Filter to a term that matches nothing → zero rows.
    await adminPage.getByTestId(T.rekapSearch).fill("ZZ-NO-MATCH-E2E-QWERTY");
    await expect(adminPage.getByTestId(T.rekapRowCount)).toHaveText("0", { timeout: 15_000 });

    // Export must still succeed (header-only workbook), not error.
    await adminPage.getByTestId(T.exportRekap).click();
    const [download] = await Promise.all([
      adminPage.waitForEvent("download", { timeout: 20_000 }),
      adminPage.getByTestId(T.exportRekapStandard).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
  });
});
