import { Page, expect } from "@playwright/test";
import { T } from "./selectors";

/**
 * Seeded test credentials (overridable via env for CI).
 *
 * The active DB is seeded by `BE/prisma/reset-roles.ts`, which provisions the
 * MASTER/MANAGER/ADMIN/PETUGAS accounts below with the shared password
 * `Volthub123!` (not the legacy `password123` from the old seed.ts).
 */
const DEFAULT_PASSWORD = process.env.E2E_PASSWORD || "Volthub123!";

export const CREDENTIALS = {
  superadmin: {
    email: process.env.E2E_SUPERADMIN_EMAIL || "master@voltreport.com",
    password: process.env.E2E_SUPERADMIN_PASSWORD || DEFAULT_PASSWORD,
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || "admin@voltreport.com",
    password: process.env.E2E_ADMIN_PASSWORD || DEFAULT_PASSWORD,
  },
  manager: {
    email: process.env.E2E_MANAGER_EMAIL || "manager@voltreport.com",
    password: process.env.E2E_MANAGER_PASSWORD || DEFAULT_PASSWORD,
  },
  petugas: {
    email: process.env.E2E_PETUGAS_EMAIL || "petugas@voltreport.com",
    password: process.env.E2E_PETUGAS_PASSWORD || DEFAULT_PASSWORD,
  },
};

/**
 * Log in through the real login form and wait for the dashboard.
 *
 * Selectors are stable hooks (`#email`, `#password`, `[data-testid=login-submit]`)
 * rather than the visible button text, which mutates to "Memverifikasi…" /
 * "Berhasil" mid-submit.
 */
export async function login(page: Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.getByTestId(T.loginSubmit).click();
  // The app navigates to /dashboard on success (mustChangePassword users go to
  // /change-password — seeded demo users do not).
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
}

/**
 * Open the top-bar account menu and trigger logout.
 *
 * Logout lives inside the avatar dropdown (`user-menu-trigger` → `logout-button`),
 * not as a bare top-level button — the post-redesign location. The auth store's
 * logout() clears state; the `/_app` route guard then redirects to /login.
 */
export async function logout(page: Page): Promise<void> {
  await page.getByTestId(T.userMenuTrigger).click();
  await page.getByTestId(T.logoutButton).click();
  await page.waitForURL("**/login", { timeout: 15_000 });
}

/** Assert we are on an authenticated route (not bounced back to /login). */
export async function expectAuthenticated(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * A 1×1 transparent PNG as a Buffer — the smallest valid image, used wherever a
 * test needs to attach a real (decodable) photo (documentation upload, avatar).
 */
export const ONE_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** A short unique marker so a created report is findable later (per run/test). */
export function uniqueMarker(prefix = "E2E"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
}

/**
 * Dismiss the blocking "N file ditambahkan" / generic SweetAlert OK modal that
 * UploadZone shows after a successful add — it overlays the page and would
 * intercept later clicks. No-op when no modal is present.
 */
export async function dismissSwal(page: Page): Promise<void> {
  const ok = page.locator(".swal2-confirm");
  if (await ok.isVisible().catch(() => false)) await ok.click();
}

/**
 * Fill the required Laporan Awal fields and submit. Returns the marker written
 * into `pekerjaan` so callers can find the report in History/Validasi.
 *
 * Required (zod): nomorSPJ, up3, pekerjaan (≥5 chars), lokasiGardu. hari/tanggal
 * auto-fill with today. On success the app navigates to /history.
 */
export async function createLaporanAwal(
  page: Page,
  opts: { marker?: string } = {},
): Promise<string> {
  const marker = opts.marker ?? uniqueMarker("AWAL");
  await page.goto("/laporan-awal");
  await expect(page).toHaveURL(/\/laporan-awal/);
  await page.locator('input[name="nomorSPJ"]').fill(`SPJ-${marker}`);
  await page.locator('input[name="up3"]').fill("UP3 E2E");
  await page.locator('input[name="pekerjaan"]').fill(`Pemeliharaan ${marker}`);
  await page.locator('input[name="lokasiGardu"]').fill("GD-E2E-01");
  await page.getByTestId(T.submitLaporanAwal).click();
  await page.waitForURL("**/history", { timeout: 20_000 });
  return marker;
}

/**
 * Fill all required Laporan Akhir fields, attach one documentation photo, and
 * submit. Returns the marker written into `jenisPekerjaan`.
 */
export async function createLaporanAkhir(
  page: Page,
  opts: { marker?: string } = {},
): Promise<string> {
  const marker = opts.marker ?? uniqueMarker("AKHIR");
  await page.goto("/laporan-akhir");
  await expect(page).toHaveURL(/\/laporan-akhir/);

  // Attach the photo to the documentation zone (accepts image/png), not the
  // XLSX-only logger zone.
  await page.getByTestId(T.uploadDokumentasi).setInputFiles({
    name: "dokumentasi-e2e.png",
    mimeType: "image/png",
    buffer: ONE_PX_PNG,
  });
  await dismissSwal(page);
  await expect(page.getByText("dokumentasi-e2e.png").first()).toBeVisible({ timeout: 10_000 });

  const text = (name: string, value: string) =>
    page.locator(`[name="${name}"]`).fill(value);
  await text("jenisPekerjaan", `Pemeliharaan ${marker}`);
  await text("up3", "UP3 E2E");
  await text("gardu", "GD-E2E-01");
  await text("rtuNama", "RTU-E2E");
  await text("rtuType", "Mitsubishi");
  await text("mediaNama", "Media-E2E");
  await text("mediaType", "Fiber Optic");
  await text("rectifierNama", "Rectifier-E2E");
  await text("rectifierType", "DC48V");
  await text("bateraiNama", "Baterai-E2E");
  await text("bateraiType", "VRLA 100Ah");
  await text("langkahPekerjaan", "Pengecekan dan pemeliharaan perangkat SCADA gardu E2E.");
  await text("hasilPekerjaan", "Semua perangkat normal dan beroperasi baik.");
  await text("pengawas", "Pengawas E2E");
  await text("pelaksana", "Pelaksana E2E");

  await page.getByTestId(T.submitLaporanAkhir).click();
  await page.waitForURL("**/history", { timeout: 25_000 });
  return marker;
}

/**
 * Locate a report card in the validasi Pending queue by the unique marker baked
 * into its title (`Pemeliharaan <marker>`). The card is the rounded container the
 * Validasi page renders per pending report.
 */
function validasiCard(adminPage: Page, marker: string) {
  return adminPage
    .locator("div.rounded-2xl", { hasText: `Pemeliharaan ${marker}` })
    .first();
}

/**
 * Approve a uniquely-marked PENDING report through the real validasi UI.
 * Drives the actual DRAFT/PENDING → APPROVED transition (no status mocking).
 */
export async function approveByMarker(adminPage: Page, marker: string): Promise<void> {
  await adminPage.goto("/validasi");
  const card = validasiCard(adminPage, marker);
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByTestId(T.approveReport).click();
  await expect(adminPage.getByText(/disetujui|berhasil/i).first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Reject a uniquely-marked PENDING report with a reason through the real validasi
 * UI. Drives the actual PENDING → REJECTED transition and records the reason on
 * the ReportValidation row (surfaced later in the approval timeline).
 */
export async function rejectByMarker(
  adminPage: Page,
  marker: string,
  reason: string,
): Promise<void> {
  await adminPage.goto("/validasi");
  const card = validasiCard(adminPage, marker);
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByTestId(T.rejectReport).click();
  await adminPage.getByTestId(T.rejectNotes).fill(reason);
  await adminPage.getByTestId(T.rejectConfirm).click();
  await expect(adminPage.getByText(/ditolak/i).first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Open the most-recently-created report's detail dialog from History. With
 * serial workers the newest report (orderBy createdAt desc → first row) is the
 * one the current test just produced, so this is a deterministic way to inspect
 * a freshly-transitioned report without a pekerjaan column to search on.
 */
export async function openLatestHistoryDetail(page: Page): Promise<void> {
  await page.goto("/history");
  await page.getByTestId(T.historyDetailBtnDesktop).first().click();
  await expect(page.getByTestId(T.historyDetailDialog)).toBeVisible({ timeout: 10_000 });
}
