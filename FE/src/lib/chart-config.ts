// VoltHub — Konfigurasi chart global (Opsi C "PLN Corporate Bold").
// Palet warna seri + gaya tooltip Recharts yang konsisten di seluruh halaman.
//
// Catatan aksesibilitas: pemisahan CVD antar warna adjacens tervalidasi (ΔE≥25),
// tetapi oranye/hijau/kuning berkontras rendah terhadap permukaan terang — maka
// SETIAP chart wajib menyertakan legend/label teks (identitas tidak boleh
// bergantung pada warna saja) dan segmen diberi gap (paddingAngle / gap bar).

/** Palet warna chart VoltHub v2 — urutan kategorikal tetap, jangan di-cycle. */
export const CHART_COLORS = {
  primary: "#f97316", // oranye PLN — seri utama / inspeksi
  secondary: "#3b82f6", // biru — seri kedua / HAR
  success: "#22c55e", // hijau — approved / RC OK / selesai
  warning: "#eab308", // kuning — pending / LR
  danger: "#ef4444", // merah — rejected / error
  purple: "#8b5cf6", // ungu — RTUPP 4 / kategori tambahan
  gray: "#9ca3af", // abu — data tidak aktif / placeholder
} as const;

/** Urutan warna untuk seri kategorikal murni (mis. per-RTUPP), fixed order. */
export const CHART_SERIES: readonly string[] = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.purple,
];

/** Warna status laporan kanonik (hijau/kuning/merah/biru/abu). */
export const STATUS_CHART_COLORS: Record<string, string> = {
  APPROVED: CHART_COLORS.success,
  VALIDATED: CHART_COLORS.success,
  SELESAI: CHART_COLORS.success,
  CLOSED: CHART_COLORS.success,
  SUCCESS: CHART_COLORS.success,
  ACTIVE: CHART_COLORS.success,
  NORMAL: CHART_COLORS.success,
  PENDING: CHART_COLORS.warning,
  SUBMITTED: CHART_COLORS.warning,
  WAITING_APPROVAL: CHART_COLORS.warning,
  WARNING: CHART_COLORS.warning,
  REJECTED: CHART_COLORS.danger,
  REVISED: CHART_COLORS.danger,
  DAMAGED: CHART_COLORS.danger,
  CRITICAL: CHART_COLORS.danger,
  FAILED: CHART_COLORS.danger,
  DRAFT: CHART_COLORS.secondary,
  PROCESSING: CHART_COLORS.secondary,
  ON_PROGRESS: CHART_COLORS.primary,
  ASSIGNED: CHART_COLORS.warning,
  OPEN: CHART_COLORS.gray,
  RETIRED: CHART_COLORS.gray,
  OFFLINE: CHART_COLORS.gray,
  NONAKTIF: CHART_COLORS.gray,
};

/** Gaya tooltip Recharts konsisten (spread sebagai props <Tooltip {...}>). */
export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--card)",
    border: "0.5px solid var(--border)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--foreground)",
    boxShadow: "none",
  },
  labelStyle: { color: "var(--foreground)" },
  itemStyle: { color: "var(--foreground)" },
  cursor: { fill: "var(--muted)", opacity: 0.3 },
} as const;
