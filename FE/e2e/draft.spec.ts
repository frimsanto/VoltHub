import { test, expect } from "./fixtures";
import { T } from "./selectors";
import { createLaporanAwal, openLatestHistoryDetail, uniqueMarker } from "./helpers";

/**
 * DRAFT LIFECYCLE — the Laporan Awal client-side autosave.
 *
 * Drafts live in localStorage (key `voltreport_laporan_awal_draft`), not as a
 * server DRAFT row: the form debounce-saves while you type, restores on return,
 * and is cleared after a successful submit. This is the real "save draft / leave
 * / return / continue / submit" loop the app actually implements.
 */
const DRAFT_KEY = "voltreport_laporan_awal_draft";

test.describe("Draft lifecycle", () => {
  test("typing autosaves a draft and surfaces the saved indicator", async ({ petugasPage }) => {
    await petugasPage.goto("/laporan-awal");
    await petugasPage.locator('input[name="nomorSPJ"]').fill(`SPJ-${uniqueMarker("DRAFT")}`);
    await petugasPage.locator('input[name="pekerjaan"]').fill("Pemeliharaan draft otomatis E2E");

    // The toolbar badge cycles Menyimpan… → Tersimpan once the debounce fires.
    await expect(petugasPage.getByText(/Tersimpan|Menyimpan/)).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(() => petugasPage.evaluate((k) => localStorage.getItem(k), DRAFT_KEY), {
        timeout: 10_000,
      })
      .not.toBeNull();
  });

  test("a draft is restored after leaving and returning to the form", async ({ petugasPage }) => {
    const marker = uniqueMarker("KEEP");
    const spj = `SPJ-${marker}`;
    const pekerjaan = `Pemeliharaan ${marker}`;

    await petugasPage.goto("/laporan-awal");
    await petugasPage.locator('input[name="nomorSPJ"]').fill(spj);
    await petugasPage.locator('input[name="up3"]').fill("UP3 Draft");
    await petugasPage.locator('input[name="pekerjaan"]').fill(pekerjaan);
    await petugasPage.locator('input[name="lokasiGardu"]').fill("GD-DRAFT-01");

    // Wait until the draft is actually persisted before navigating away.
    await expect
      .poll(() => petugasPage.evaluate((k) => localStorage.getItem(k), DRAFT_KEY), {
        timeout: 10_000,
      })
      .not.toBeNull();

    // Leave the page entirely, then come back.
    await petugasPage.goto("/dashboard");
    await petugasPage.goto("/laporan-awal");

    await expect(petugasPage.locator('input[name="nomorSPJ"]')).toHaveValue(spj);
    await expect(petugasPage.locator('input[name="pekerjaan"]')).toHaveValue(pekerjaan);
  });

  test("a restored draft can be completed and submitted as the final version", async ({
    petugasPage,
  }) => {
    const marker = uniqueMarker("FINAL");
    const pekerjaan = `Pemeliharaan ${marker}`;

    await petugasPage.goto("/laporan-awal");
    await petugasPage.locator('input[name="nomorSPJ"]').fill(`SPJ-${marker}`);
    await petugasPage.locator('input[name="pekerjaan"]').fill(pekerjaan);
    await expect
      .poll(() => petugasPage.evaluate((k) => localStorage.getItem(k), DRAFT_KEY), {
        timeout: 10_000,
      })
      .not.toBeNull();

    // Return to the restored draft and finish the remaining required fields.
    await petugasPage.goto("/laporan-awal");
    await expect(petugasPage.locator('input[name="pekerjaan"]')).toHaveValue(pekerjaan);
    await petugasPage.locator('input[name="up3"]').fill("UP3 Final");
    await petugasPage.locator('input[name="lokasiGardu"]').fill("GD-FINAL-01");
    await petugasPage.getByTestId(T.submitLaporanAwal).click();
    await petugasPage.waitForURL("**/history", { timeout: 20_000 });

    await openLatestHistoryDetail(petugasPage);
    const dialog = petugasPage.getByTestId(T.historyDetailDialog);
    await expect(dialog.getByText(pekerjaan)).toBeVisible();
    await expect(dialog.getByText("Pending").first()).toBeVisible();
  });

  test("the draft is cleared after a successful submit", async ({ petugasPage }) => {
    // A full create through the helper submits and clears the draft on success.
    await createLaporanAwal(petugasPage);
    expect(await petugasPage.evaluate((k) => localStorage.getItem(k), DRAFT_KEY)).toBeNull();

    // A fresh visit therefore starts from an empty form.
    await petugasPage.goto("/laporan-awal");
    await expect(petugasPage.locator('input[name="nomorSPJ"]')).toHaveValue("");
  });
});
