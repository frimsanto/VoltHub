import { test, expect } from "./fixtures";
import { T } from "./selectors";
import {
  createLaporanAwal,
  createLaporanAkhir,
  approveByMarker,
  rejectByMarker,
  openLatestHistoryDetail,
  uniqueMarker,
} from "./helpers";

/**
 * REPORT LIFECYCLE — the real operational state machine, driven end to end
 * through the actual UI (no status mocking).
 *
 * Canonical `ReportStatus`: DRAFT · PENDING · APPROVED · REJECTED · REVISED.
 * What the real app can reach:
 *   • Form submit → PENDING (DRAFT is a client-only localStorage autosave; no
 *     server DRAFT row is created by the normal flow).
 *   • Validator ✓ → APPROVED, validator ✗ + reason → REJECTED.
 *   • PETUGAS may re-edit only while DRAFT/PENDING; once a validator decides
 *     (APPROVED/REJECTED) the report is locked and the Edit affordance is gone.
 * REVISED has no UI trigger (validasi only exposes Approve/Reject), so it is
 * deliberately not asserted as a reachable transition here.
 */
test.describe("Report lifecycle", () => {
  test("a submitted Laporan Awal lands in PENDING", async ({ petugasPage }) => {
    const marker = await createLaporanAwal(petugasPage);
    await openLatestHistoryDetail(petugasPage);
    const dialog = petugasPage.getByTestId(T.historyDetailDialog);
    await expect(dialog.getByText(`Pemeliharaan ${marker}`)).toBeVisible();
    await expect(dialog.getByText("Pending").first()).toBeVisible();
  });

  test("VALIDATOR approves a PENDING report → APPROVED", async ({
    petugasPage,
    adminPage,
    pendingReport,
  }) => {
    await approveByMarker(adminPage, pendingReport.marker);

    await openLatestHistoryDetail(petugasPage);
    const dialog = petugasPage.getByTestId(T.historyDetailDialog);
    await expect(dialog.getByText(`Pemeliharaan ${pendingReport.marker}`)).toBeVisible();
    await expect(dialog.getByText("Approved").first()).toBeVisible();
  });

  test("an APPROVED report is locked for PETUGAS (no Edit affordance)", async ({
    petugasPage,
    adminPage,
    pendingReport,
  }) => {
    await approveByMarker(adminPage, pendingReport.marker);

    await openLatestHistoryDetail(petugasPage);
    const dialog = petugasPage.getByTestId(T.historyDetailDialog);
    await expect(dialog.getByText("Approved").first()).toBeVisible();
    // EDITABLE_STATUSES excludes APPROVED → the "Edit Laporan" button is gone.
    await expect(dialog.getByRole("button", { name: /Edit Laporan/i })).toHaveCount(0);
  });

  test("VALIDATOR rejects a PENDING report with a reason → REJECTED", async ({
    petugasPage,
    adminPage,
    pendingReport,
  }) => {
    await rejectByMarker(adminPage, pendingReport.marker, "Dokumentasi belum lengkap (E2E).");

    await openLatestHistoryDetail(petugasPage);
    const dialog = petugasPage.getByTestId(T.historyDetailDialog);
    await expect(dialog.getByText(`Pemeliharaan ${pendingReport.marker}`)).toBeVisible();
    await expect(dialog.getByText("Rejected").first()).toBeVisible();
  });

  test("a REJECTED report is locked for PETUGAS (Edit hidden)", async ({
    petugasPage,
    adminPage,
    pendingReport,
  }) => {
    await rejectByMarker(adminPage, pendingReport.marker, "Perlu perbaikan data (E2E).");

    await openLatestHistoryDetail(petugasPage);
    const dialog = petugasPage.getByTestId(T.historyDetailDialog);
    await expect(dialog.getByText("Rejected").first()).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Edit Laporan/i })).toHaveCount(0);
  });

  test("PETUGAS edits a PENDING report and resubmits (stays PENDING)", async ({ petugasPage }) => {
    await createLaporanAwal(petugasPage);

    // Open the newest (just-created, PENDING → editable) report's edit form.
    await petugasPage.getByTestId(T.historyEditBtnDesktop).first().click();
    await petugasPage.waitForURL(/\/laporan-awal\?edit=/, { timeout: 15_000 });
    const pekerjaan = petugasPage.locator('input[name="pekerjaan"]');
    await expect(pekerjaan).not.toHaveValue("", { timeout: 15_000 });

    const revised = uniqueMarker("EDIT");
    await pekerjaan.fill(`Pemeliharaan ${revised}`);
    await petugasPage.getByTestId(T.submitLaporanAwal).click();
    await petugasPage.waitForURL("**/history", { timeout: 20_000 });

    // The edited report is still PENDING (edit does not change status) and shows
    // the revised pekerjaan text.
    await openLatestHistoryDetail(petugasPage);
    const dialog = petugasPage.getByTestId(T.historyDetailDialog);
    await expect(dialog.getByText(`Pemeliharaan ${revised}`)).toBeVisible();
    await expect(dialog.getByText("Pending").first()).toBeVisible();
  });

  test("Laporan Akhir create+documentation → VALIDATOR approves → APPROVED", async ({
    petugasPage,
    adminPage,
  }) => {
    const marker = await createLaporanAkhir(petugasPage);
    await approveByMarker(adminPage, marker);

    await openLatestHistoryDetail(petugasPage);
    const dialog = petugasPage.getByTestId(T.historyDetailDialog);
    await expect(dialog.getByText("Approved").first()).toBeVisible();
  });
});
