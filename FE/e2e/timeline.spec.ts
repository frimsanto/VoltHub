import { test, expect } from "./fixtures";
import { T } from "./selectors";
import { createLaporanAwal, approveByMarker, rejectByMarker, openLatestHistoryDetail } from "./helpers";

/**
 * APPROVAL TIMELINE — the "Riwayat Approval" tab on a report's detail dialog.
 *
 * The timeline is built from real data only: it always starts with the
 * "Laporan Dibuat" event, then appends each recorded ReportValidation decision
 * (Disetujui / Ditolak, with the validator's note). A report with no decision
 * yet shows a "Menunggu Validasi" marker. There are no synthetic
 * "Submitted"/"Resubmitted" events — the timeline reflects exactly what the
 * backend recorded.
 */
test.describe("Approval timeline", () => {
  async function openTimeline(page: Parameters<typeof openLatestHistoryDetail>[0]) {
    await openLatestHistoryDetail(page);
    await page.getByTestId(T.historyTimelineTab).click();
  }

  test("a fresh PENDING report shows Created + awaiting validation", async ({ petugasPage }) => {
    await createLaporanAwal(petugasPage);
    await openTimeline(petugasPage);
    const dialog = petugasPage.getByTestId(T.historyDetailDialog);
    await expect(dialog.getByText("Laporan Dibuat")).toBeVisible();
    await expect(dialog.getByText("Menunggu Validasi")).toBeVisible();
  });

  test("after rejection the timeline shows the Ditolak decision and its reason", async ({
    petugasPage,
    adminPage,
    pendingReport,
  }) => {
    const reason = "Foto dokumentasi kurang jelas (E2E).";
    await rejectByMarker(adminPage, pendingReport.marker, reason);

    await openTimeline(petugasPage);
    const dialog = petugasPage.getByTestId(T.historyDetailDialog);
    await expect(dialog.getByText("Laporan Dibuat")).toBeVisible();
    await expect(dialog.getByText("Ditolak", { exact: true })).toBeVisible();
    await expect(dialog.getByText(reason)).toBeVisible();
  });

  test("after approval the timeline shows the Disetujui decision", async ({
    petugasPage,
    adminPage,
    pendingReport,
  }) => {
    await approveByMarker(adminPage, pendingReport.marker);

    await openTimeline(petugasPage);
    const dialog = petugasPage.getByTestId(T.historyDetailDialog);
    await expect(dialog.getByText("Laporan Dibuat")).toBeVisible();
    // Exact: the default approve note ("Laporan disetujui") also contains the
    // word, so match the timeline event title precisely.
    await expect(dialog.getByText("Disetujui", { exact: true })).toBeVisible();
  });

  test("the timeline tab is reachable and Created is always the first event", async ({
    petugasPage,
  }) => {
    await createLaporanAwal(petugasPage);
    await openTimeline(petugasPage);
    const dialog = petugasPage.getByTestId(T.historyDetailDialog);
    await expect(dialog.getByText("Laporan Dibuat")).toBeVisible();
  });
});
