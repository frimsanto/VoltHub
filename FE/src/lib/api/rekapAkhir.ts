import apiClient, { ApiResponse, handleResponse } from "./client";
import { downloadBlob } from "./export";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RekapAkhirItem {
  id: string;
  reportId: string;
  laporanAwalId?: string | null;
  nomorSPJ: string;
  tanggalSelesai: string;
  up3: string;
  // Legacy fields (data lama)
  pekerjaan?: string;
  namaAset?: string;
  tagSCADA?: string;
  bayPosisi?: string;
  teganganNominal?: string;
  detailLangkah?: string;
  hasilTahananIsolasi?: string | null;
  hasilPengukuranBeban?: string | null;
  catatanHasil?: string | null;
  statusPekerjaan?: string | null;
  durasiPekerjaan?: string | null;
  catatanTambahan?: string | null;
  // New SCADA fields
  gardu?: string | null;
  jenisPekerjaan?: string | null;
  asdu?: string | null;
  ipModem?: string | null;
  ipRTU?: string | null;
  ipSIM1?: string | null;
  ipSIM2?: string | null;
  ipGTWIconPlus?: string | null;
  ipWAN?: string | null;
  rtuNama?: string | null;
  rtuType?: string | null;
  mediaNama?: string | null;
  mediaType?: string | null;
  rectifierNama?: string | null;
  rectifierType?: string | null;
  bateraiNama?: string | null;
  bateraiType?: string | null;
  catatanRTU?: string | null;
  catatanMedia?: string | null;
  catatanRectifier?: string | null;
  catatanBaterai?: string | null;
  catatanLain?: string | null;
  statusSebelum?: string | null;
  statusSesudah?: string | null;
  pengawas?: string | null;
  pelaksana?: string | null;
  // Status & audit
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "REVISED";
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  // Relations
  createdBy?: {
    id: string;
    name: string;
    email: string;
    rtupp?: { id: string; name: string; code: string } | null;
    team?: { id: string; name: string; code: string } | null;
  };
  approvedBy?: { id: string; name: string } | null;
  rejectedBy?: { id: string; name: string } | null;
  laporan_awal?: { reportId: string } | null;
  _count?: { attachments: number };
}

export interface RekapAkhirParams {
  status?: string;
  search?: string;
  petugas?: string;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  rtuppId?: string;
  orderByField?: string;
  orderDir?: "asc" | "desc";
}

export interface RekapAkhirSummary {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  draft: number;
  approvedToday: number;
  approvedThisMonth: number;
}

export interface RekapAkhirResponse {
  items: RekapAkhirItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  summary?: RekapAkhirSummary;
}

// ─── Column definitions ───────────────────────────────────────────────────────

export interface ColumnDef {
  key: string;
  label: string;
  group: string;
  defaultOn: boolean;
  width: number; // pixel min-width untuk tabel
  exportWidth?: number; // karakter lebar untuk XLSX (opsional)
}

// Grup disederhanakan menjadi 7 kategori: Identitas, Lokasi, Perangkat, Jaringan, Status, Hasil, Audit.
// defaultOn = kolom monitoring harian admin; sisanya tersedia tapi hidden (toggle via panel kolom).
export const COLUMN_DEFS: ColumnDef[] = [
  // ── Identitas
  { key: "reportId", label: "Report ID", group: "Identitas", defaultOn: true, width: 130 },
  { key: "laporanAwalId", label: "ID Lap. Awal", group: "Identitas", defaultOn: false, width: 130 },
  { key: "nomorSPJ", label: "Nomor SPJ", group: "Identitas", defaultOn: false, width: 130 },
  { key: "tanggalSelesai", label: "Tanggal", group: "Identitas", defaultOn: true, width: 110 },
  // ── Lokasi (termasuk identitas organisasi RTUPP/Team & petugas)
  { key: "petugas", label: "Petugas", group: "Lokasi", defaultOn: true, width: 140 },
  { key: "rtuppNama", label: "RTUPP", group: "Lokasi", defaultOn: true, width: 150 },
  { key: "rtuppKode", label: "Kode RTUPP", group: "Lokasi", defaultOn: false, width: 110 },
  { key: "teamNama", label: "Team", group: "Lokasi", defaultOn: true, width: 130 },
  { key: "up3", label: "UP3", group: "Lokasi", defaultOn: false, width: 120 },
  { key: "gardu", label: "Gardu", group: "Lokasi", defaultOn: true, width: 150 },
  { key: "jenisPekerjaan", label: "Jenis Pekerjaan", group: "Lokasi", defaultOn: true, width: 180 },
  { key: "bayPosisi", label: "Bay / Posisi", group: "Lokasi", defaultOn: false, width: 100 },
  // ── Perangkat (aset SCADA + catatan kondisi)
  { key: "rtu", label: "RTU", group: "Perangkat", defaultOn: false, width: 200 },
  { key: "media", label: "Media", group: "Perangkat", defaultOn: false, width: 200 },
  { key: "rectifier", label: "Rectifier", group: "Perangkat", defaultOn: false, width: 200 },
  { key: "baterai", label: "Baterai", group: "Perangkat", defaultOn: false, width: 200 },
  { key: "tagSCADA", label: "Tag SCADA", group: "Perangkat", defaultOn: false, width: 120 },
  {
    key: "teganganNominal",
    label: "Teg. Nominal",
    group: "Perangkat",
    defaultOn: false,
    width: 110,
  },
  { key: "catatanRTU", label: "Cat. RTU", group: "Perangkat", defaultOn: false, width: 110 },
  { key: "catatanMedia", label: "Cat. Media", group: "Perangkat", defaultOn: false, width: 110 },
  {
    key: "catatanRectifier",
    label: "Cat. Rectifier",
    group: "Perangkat",
    defaultOn: false,
    width: 120,
  },
  {
    key: "catatanBaterai",
    label: "Cat. Baterai",
    group: "Perangkat",
    defaultOn: false,
    width: 120,
  },
  { key: "catatanLain", label: "Cat. Lain", group: "Perangkat", defaultOn: false, width: 160 },
  {
    key: "catatanTambahan",
    label: "Cat. Tambahan",
    group: "Perangkat",
    defaultOn: false,
    width: 200,
  },
  // ── Jaringan (teknis, hidden by default)
  { key: "asdu", label: "ASDU", group: "Jaringan", defaultOn: false, width: 80 },
  { key: "ipModem", label: "IP Modem", group: "Jaringan", defaultOn: false, width: 120 },
  { key: "ipRTU", label: "IP RTU", group: "Jaringan", defaultOn: false, width: 120 },
  { key: "ipSIM1", label: "IP SIM 1", group: "Jaringan", defaultOn: false, width: 120 },
  { key: "ipSIM2", label: "IP SIM 2", group: "Jaringan", defaultOn: false, width: 120 },
  { key: "ipGTWIconPlus", label: "IP GTW ICON+", group: "Jaringan", defaultOn: false, width: 130 },
  { key: "ipWAN", label: "IP WAN", group: "Jaringan", defaultOn: false, width: 120 },
  // ── Status
  { key: "statusSebelum", label: "Status Sebelum", group: "Status", defaultOn: true, width: 120 },
  { key: "statusSesudah", label: "Status Sesudah", group: "Status", defaultOn: true, width: 120 },
  {
    key: "statusPekerjaan",
    label: "Status Pekerjaan",
    group: "Status",
    defaultOn: false,
    width: 130,
  },
  { key: "status", label: "Status Approval", group: "Status", defaultOn: true, width: 130 },
  // ── Hasil & penutup
  {
    key: "detailLangkah",
    label: "Langkah Pekerjaan",
    group: "Hasil",
    defaultOn: false,
    width: 300,
  },
  { key: "hasilPekerjaan", label: "Hasil Pekerjaan", group: "Hasil", defaultOn: false, width: 200 },
  {
    key: "hasilTahananIsolasi",
    label: "Thn. Isolasi",
    group: "Hasil",
    defaultOn: false,
    width: 120,
  },
  {
    key: "hasilPengukuranBeban",
    label: "Ukur. Beban",
    group: "Hasil",
    defaultOn: false,
    width: 120,
  },
  { key: "durasiPekerjaan", label: "Durasi", group: "Hasil", defaultOn: false, width: 100 },
  { key: "pengawas", label: "Pengawas", group: "Hasil", defaultOn: true, width: 140 },
  { key: "pelaksana", label: "Pelaksana", group: "Hasil", defaultOn: true, width: 140 },
  // ── Audit
  { key: "tanggalDibuat", label: "Tgl Dibuat", group: "Audit", defaultOn: false, width: 110 },
  { key: "submittedAt", label: "Tgl Submit", group: "Audit", defaultOn: false, width: 110 },
  { key: "approvedAt", label: "Tgl Approve", group: "Audit", defaultOn: false, width: 110 },
  { key: "rejectedAt", label: "Tgl Ditolak", group: "Audit", defaultOn: false, width: 110 },
  { key: "approvedBy", label: "Disetujui Oleh", group: "Audit", defaultOn: false, width: 140 },
  { key: "rejectedBy", label: "Ditolak Oleh", group: "Audit", defaultOn: false, width: 140 },
  { key: "jumlahLampiran", label: "Lampiran", group: "Audit", defaultOn: false, width: 90 },
];

export const DEFAULT_EXPORT_COLUMNS = COLUMN_DEFS.filter((c) => c.defaultOn).map((c) => c.key);

// ─── Export templates ─────────────────────────────────────────────────────────

export const EXPORT_TEMPLATES: Record<
  string,
  { label: string; description: string; columns: string[] }
> = {
  standard: {
    label: "Standard",
    description: "Identitas, petugas, lokasi, aset, langkah & hasil pekerjaan, status",
    columns: [
      "reportId",
      "nomorSPJ",
      "tanggalSelesai",
      "rtuppNama",
      "teamNama",
      "petugas",
      "up3",
      "gardu",
      "jenisPekerjaan",
      "rtu",
      "media",
      "catatanRTU",
      "catatanMedia",
      "statusSebelum",
      "statusSesudah",
      "statusPekerjaan",
      "detailLangkah",
      "hasilPekerjaan",
      "approvedBy",
      "status",
    ],
  },
  teknikal: {
    label: "Teknikal",
    description: "Standard + semua IP, aset SCADA lengkap, catatan perangkat, langkah kerja detail",
    columns: [
      "reportId",
      "laporanAwalId",
      "nomorSPJ",
      "tanggalSelesai",
      "rtuppNama",
      "rtuppKode",
      "teamNama",
      "petugas",
      "up3",
      "gardu",
      "jenisPekerjaan",
      "bayPosisi",
      "tagSCADA",
      "teganganNominal",
      "asdu",
      "ipModem",
      "ipRTU",
      "ipSIM1",
      "ipSIM2",
      "ipGTWIconPlus",
      "ipWAN",
      "rtu",
      "media",
      "rectifier",
      "baterai",
      "catatanRTU",
      "catatanMedia",
      "catatanRectifier",
      "catatanBaterai",
      "catatanLain",
      "catatanTambahan",
      "statusSebelum",
      "statusSesudah",
      "statusPekerjaan",
      "detailLangkah",
      "hasilPekerjaan",
      "hasilTahananIsolasi",
      "hasilPengukuranBeban",
      "durasiPekerjaan",
      "pengawas",
      "pelaksana",
      "approvedBy",
      "approvedAt",
      "jumlahLampiran",
      "status",
    ],
  },
  lengkap: {
    label: "Lengkap",
    description: "Semua kolom yang tersedia",
    columns: COLUMN_DEFS.map((c) => c.key),
  },
};

// ─── getCellValue ─────────────────────────────────────────────────────────────

function fmt(val: string | null | undefined) {
  return val ?? "-";
}
function fmtDate(val: string | null | undefined) {
  if (!val) return "-";
  try {
    return new Date(val).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return val;
  }
}

export function getCellValue(row: RekapAkhirItem, key: string): string {
  const map: Record<string, () => string> = {
    reportId: () => fmt(row.reportId),
    laporanAwalId: () => fmt(row.laporan_awal?.reportId ?? row.laporanAwalId),
    nomorSPJ: () => fmt(row.nomorSPJ),
    tanggalSelesai: () => fmtDate(row.tanggalSelesai),
    tanggalDibuat: () => fmtDate(row.createdAt),
    submittedAt: () => fmtDate(row.submittedAt),
    approvedAt: () => fmtDate(row.approvedAt),
    rtuppNama: () => fmt(row.createdBy?.rtupp?.name),
    rtuppKode: () => fmt(row.createdBy?.rtupp?.code),
    teamNama: () => fmt(row.createdBy?.team?.name),
    petugas: () => fmt(row.createdBy?.name),
    approvedBy: () => fmt(row.approvedBy?.name),
    rejectedBy: () => fmt(row.rejectedBy?.name),
    up3: () => fmt(row.up3),
    gardu: () => fmt(row.gardu ?? row.namaAset),
    jenisPekerjaan: () => fmt(row.jenisPekerjaan ?? row.pekerjaan),
    bayPosisi: () => fmt(row.bayPosisi),
    rtu: () => [row.rtuNama, row.rtuType].filter(Boolean).join(" / ") || fmt(row.namaAset),
    media: () => [row.mediaNama, row.mediaType].filter(Boolean).join(" / ") || "-",
    rectifier: () => [row.rectifierNama, row.rectifierType].filter(Boolean).join(" / ") || "-",
    baterai: () => [row.bateraiNama, row.bateraiType].filter(Boolean).join(" / ") || "-",
    tagSCADA: () => fmt(row.tagSCADA),
    teganganNominal: () => fmt(row.teganganNominal),
    asdu: () => fmt(row.asdu),
    ipModem: () => fmt(row.ipModem),
    ipRTU: () => fmt(row.ipRTU),
    ipSIM1: () => fmt(row.ipSIM1),
    ipSIM2: () => fmt(row.ipSIM2),
    ipGTWIconPlus: () => fmt(row.ipGTWIconPlus),
    ipWAN: () => fmt(row.ipWAN),
    catatanRTU: () => fmt(row.catatanRTU),
    catatanMedia: () => fmt(row.catatanMedia),
    catatanRectifier: () => fmt(row.catatanRectifier),
    catatanBaterai: () => fmt(row.catatanBaterai),
    catatanLain: () => fmt(row.catatanLain),
    catatanTambahan: () => fmt(row.catatanTambahan),
    statusSebelum: () => fmt(row.statusSebelum),
    statusSesudah: () => fmt(row.statusSesudah),
    statusPekerjaan: () => fmt(row.statusPekerjaan),
    detailLangkah: () => fmt(row.detailLangkah),
    hasilPekerjaan: () => fmt(row.catatanHasil),
    hasilTahananIsolasi: () => fmt(row.hasilTahananIsolasi),
    hasilPengukuranBeban: () => fmt(row.hasilPengukuranBeban),
    durasiPekerjaan: () => fmt(row.durasiPekerjaan),
    pengawas: () => fmt(row.pengawas),
    pelaksana: () => fmt(row.pelaksana),
    jumlahLampiran: () => String(row._count?.attachments ?? 0),
    status: () => fmt(row.status),
    rejectedAt: () => fmtDate(row.rejectedAt),
  };
  return map[key]?.() ?? "-";
}

// ─── API functions ────────────────────────────────────────────────────────────

export const getRekap = async (params?: RekapAkhirParams): Promise<RekapAkhirResponse> => {
  const response = await apiClient.get<ApiResponse<RekapAkhirResponse>>("/rekap-akhir", { params });
  return handleResponse(response);
};

export const exportRekap = async (
  params?: RekapAkhirParams & { columns?: string },
): Promise<void> => {
  const response = await apiClient.get("/rekap-akhir/export", { params, responseType: "blob" });
  const ts = new Date().toISOString().slice(0, 10);
  downloadBlob(response.data as Blob, `Rekap_LapAkhir_${ts}.xlsx`);
};
