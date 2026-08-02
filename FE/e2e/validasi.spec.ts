import { test, expect } from "./fixtures";
import { T } from "./selectors";

/**
 * VALIDASI — the admin approval queue. Each approve/reject test seeds its own
 * PENDING report via the `pendingReport` fixture (created as petugas), so the
 * queue always has a deterministic, uniquely-marked target to act on.
 */
test.describe("Validasi", () => {
  test("opens the pending validation queue", async ({ adminPage }) => {
    await adminPage.goto("/validasi");
    await expect(adminPage).toHaveURL(/\/validasi/);
    await expect(adminPage.getByRole("heading", { name: /Validasi Laporan/i })).toBeVisible();
    await expect(adminPage.getByRole("tab", { name: /Pending/i })).toBeVisible();
  });

  test("approves a pending report", async ({ adminPage, pendingReport }) => {
    await adminPage.goto("/validasi");
    const card = adminPage
      .locator("div.rounded-2xl", { hasText: `Pemeliharaan ${pendingReport.marker}` })
      .first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByTestId(T.approveReport).click();
    await expect(adminPage.getByText(/disetujui|berhasil/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("rejects a pending report with a reason", async ({ adminPage, pendingReport }) => {
    await adminPage.goto("/validasi");
    const card = adminPage
      .locator("div.rounded-2xl", { hasText: `Pemeliharaan ${pendingReport.marker}` })
      .first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByTestId(T.rejectReport).click();
    // Reject dialog → reason → confirm.
    await adminPage.getByTestId(T.rejectNotes).fill("Dokumentasi belum lengkap (E2E).");
    await adminPage.getByTestId(T.rejectConfirm).click();
    await expect(adminPage.getByText(/ditolak/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
