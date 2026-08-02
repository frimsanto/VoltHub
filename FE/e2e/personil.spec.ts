import { test, expect } from "./fixtures";
import { T } from "./selectors";

/**
 * PERSONIL MANAGEMENT — the "Tim Pelaksana" multi-select snapshot on Laporan
 * Awal. Personil are picked from the master list scoped to the petugas' RTUPP
 * (read-only for PETUGAS); each pick is copied into an immutable personilSnapshot
 * stored with the report.
 *
 * Master personil availability depends on the seeded DB for the petugas' RTUPP,
 * so these tests exercise the real picker and branch on whether options exist —
 * both the populated (add/remove) and empty-master paths are valid app states.
 */
test.describe("Personil management", () => {
  test("the personil picker opens and lists master data or an empty-state message", async ({
    petugasPage,
  }) => {
    await petugasPage.goto("/laporan-awal");
    await petugasPage.getByTestId(T.personilAdd).click();

    // The picker (search box) is open…
    await expect(petugasPage.getByPlaceholder(/Cari personil/i)).toBeVisible();

    const options = petugasPage.getByTestId(T.personilOption);
    const optionCount = await options.count();
    if (optionCount === 0) {
      // Real empty states: no master for this RTUPP, or account not RTUPP-scoped.
      await expect(
        petugasPage.getByText(/Belum ada master personil|belum terhubung ke RTUPP|Ketik untuk mencari/i),
      ).toBeVisible();
    } else {
      await expect(options.first()).toBeVisible();
    }
  });

  test("adding a personil creates a chip and increments the count", async ({ petugasPage }) => {
    await petugasPage.goto("/laporan-awal");
    await expect(petugasPage.getByTestId(T.personilCount)).toContainText("0");

    await petugasPage.getByTestId(T.personilAdd).click();
    const options = petugasPage.getByTestId(T.personilOption);

    test.skip((await options.count()) === 0, "No master personil seeded for this RTUPP");

    await options.first().click();
    await expect(petugasPage.getByTestId(T.personilChip)).toHaveCount(1);
    await expect(petugasPage.getByTestId(T.personilCount)).toContainText("1");
  });

  test("removing a personil clears the chip and decrements the count", async ({ petugasPage }) => {
    await petugasPage.goto("/laporan-awal");
    await petugasPage.getByTestId(T.personilAdd).click();
    const options = petugasPage.getByTestId(T.personilOption);

    test.skip((await options.count()) === 0, "No master personil seeded for this RTUPP");

    await options.first().click();
    await expect(petugasPage.getByTestId(T.personilChip)).toHaveCount(1);

    await petugasPage.getByTestId(T.personilRemove).first().click();
    await expect(petugasPage.getByTestId(T.personilChip)).toHaveCount(0);
    await expect(petugasPage.getByTestId(T.personilCount)).toContainText("0");
  });
});
