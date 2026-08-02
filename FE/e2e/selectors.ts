/**
 * Central registry of E2E `data-testid` hooks — the single source of truth shared
 * by the source components and the specs. Importing from here (instead of pasting
 * raw strings into tests) means a renamed hook breaks compilation, not silently a
 * test, and the testid surface is reviewable in one place.
 *
 * Every value below corresponds to a `data-testid` attribute in `FE/src`.
 */
export const T = {
  // ── Auth ────────────────────────────────────────────────────────────────
  loginSubmit: "login-submit",
  userMenuTrigger: "user-menu-trigger",
  logoutButton: "logout-button",

  // ── Dashboard ───────────────────────────────────────────────────────────
  dashboardKpiCard: "dashboard-kpi-card",
  dashboardRecentActivity: "dashboard-recent-activity",

  // ── GIS ─────────────────────────────────────────────────────────────────
  // The desktop control card and the mobile bottom sheets render at the same
  // time (Tailwind hidden/md:hidden = display:none, both stay in the DOM), so
  // each variant owns a distinct testid — otherwise a single `gis-search` /
  // `gis-layer-toggle-*` would match twice and trip Playwright strict mode.
  gisSearchDesktop: "gis-search-desktop",
  gisSearchMobile: "gis-search-mobile",
  /** Per-layer toggle on the desktop control card; suffix with a layer id. */
  gisLayerToggleDesktop: (id: string) => `gis-layer-toggle-desktop-${id}`,
  /** Per-layer toggle inside the mobile Layers sheet; suffix with a layer id. */
  gisLayerToggleMobile: (id: string) => `gis-layer-toggle-mobile-${id}`,
  gisFilterStatus: "gis-filter-status",
  gisFilterWilayah: "gis-filter-wilayah",
  gisDetailPanel: "gis-detail-panel",
  gisMobileLayers: "gis-mobile-layers",
  gisMobileFilter: "gis-mobile-filter",

  // ── Laporan forms (FormParts) ───────────────────────────────────────────
  submitLaporanAwal: "submit-laporan-awal",
  submitLaporanAkhir: "submit-laporan-akhir",
  uploadLogger: "upload-logger",
  uploadSld: "upload-sld",
  uploadDokumentasi: "upload-dokumentasi",
  fieldError: "field-error",
  // Personil (Tim Pelaksana) — multi-select snapshot on Laporan Awal.
  personilAdd: "personil-add",
  personilOption: "personil-option",
  personilChip: "personil-chip",
  personilRemove: "personil-remove",
  personilCount: "personil-count",

  // ── Riwayat / History ───────────────────────────────────────────────────
  // The history list renders a mobile card layout and a desktop table layout
  // concurrently (md:hidden / hidden md:block), so the "open detail" button is
  // split per layout — the visible one owns the testid for its viewport.
  historyRow: "history-row",
  historyDetailBtnDesktop: "history-detail-btn-desktop",
  historyDetailBtnMobile: "history-detail-btn-mobile",
  // Edit (pencil) action — only rendered for PETUGAS-editable rows (DRAFT/PENDING),
  // split per layout like the detail button so the visible one owns the testid.
  historyEditBtnDesktop: "history-edit-btn-desktop",
  historyEditBtnMobile: "history-edit-btn-mobile",
  historyDetailDialog: "history-detail-dialog",
  // Approval timeline tab inside the detail dialog.
  historyTimelineTab: "history-timeline-tab",

  // ── Profile ─────────────────────────────────────────────────────────────
  profileAvatarInput: "profile-avatar-input",
  profileAvatarImg: "profile-avatar-img",
  profileEmail: "profile-email",
  profilePhone: "profile-phone",
  profileSave: "profile-save",

  // ── Validasi ────────────────────────────────────────────────────────────
  reportDetail: "report-detail",
  approveReport: "approve-report",
  confirmApprove: "confirm-approve",
  rejectReport: "reject-report",
  rejectNotes: "reject-notes",
  rejectConfirm: "reject-confirm",

  // ── Export (Rekap) ──────────────────────────────────────────────────────
  exportRekap: "export-rekap",
  exportRekapStandard: "export-rekap-standard",
  rekapSearch: "rekap-search",
  rekapRowCount: "rekap-row-count",

  // ── Notifications ───────────────────────────────────────────────────────
  notifBell: "notif-bell",

  // ── Mobile chrome ───────────────────────────────────────────────────────
  petugasBottomNav: "petugas-bottom-nav",
  // Role-adaptive bottom nav shell for MASTER/MANAGER/ADMIN/NOC + its "Lainnya"
  // overflow sheet (components/mobile/MobileNavShell + MobileMoreSheet).
  mobileNavShell: "mobile-nav-shell",
  mobileMoreSheet: "mobile-more-sheet",
} as const;
