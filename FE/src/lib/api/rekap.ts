import apiClient, { ApiResponse, handleResponse } from "./client";
import { downloadBlob } from "./export";

// ─── Rekap Awal — detailed spreadsheet view of Laporan Awal ─────────────────────

export interface RekapItem {
  id: string;
  reportId: string;
  hari?: string | null;
  tanggal?: string | null;
  nomorSPJ?: string | null;
  nomorWP?: string | null;
  up3?: string | null;
  pekerjaan?: string | null;
  lokasiGardu?: string | null;
  pelaksana?: string | null;
  penanggungJawab?: string | null;
  pengawasPekerjaan?: string | null;
  pengawasManuver?: string | null;
  pengawasK3?: string | null;
  potensiBahaya?: string | null;
  pengendalianRisiko?: string | null;
  apd?: string | null;
  rambuKerja?: string | null;
  asuransiTK?: string | null;
  kondisiPersonil?: string | null;
  jumlahPersonil?: number | null;
  apdLengkap?: boolean | null;
  potensiBahayaDijelaskan?: boolean | null;
  asuransiKetenagakerjaan?: boolean | null;
  berdoaSebelumBekerja?: boolean | null;
  wpJsahirarcSop?: boolean | null;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "REVISED";
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  createdBy?: {
    id: string;
    name: string;
    email: string;
    rtupp?: { id: string; name: string; code: string } | null;
    team?: { id: string; name: string; code: string } | null;
  };
  approvedBy?: { id: string; name: string } | null;
  rejectedBy?: { id: string; name: string } | null;
  _count?: { attachments: number };
}

export interface RekapParams {
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

export interface RekapSummary {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  draft: number;
  approvedToday: number;
  approvedThisMonth: number;
}

export interface RekapResponse {
  items: RekapItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  summary?: RekapSummary;
}

// ─── Column definitions ─────────────────────────────────────────────────────────

export interface ColumnDef {
  key: string;
  label: string;
  group: string;
  defaultOn: boolean;
  width: number;
}

// Grup: Identitas, Lokasi, Tim Kerja, K3, Status, Audit.
export const COLUMN_DEFS: ColumnDef[] = [
  // ── Identitas
  { key: "reportId", label: "Report ID", group: "Identitas", defaultOn: true, width: 130 },
  { key: "nomorSPJ", label: "Nomor SPJ", group: "Identitas", defaultOn: false, width: 130 },
  { key: "nomorWP", label: "Nomor WP", group: "Identitas", defaultOn: false, width: 120 },
  { key: "hari", label: "Hari", group: "Identitas", defaultOn: false, width: 90 },
  { key: "tanggal", label: "Tanggal", group: "Identitas", defaultOn: true, width: 110 },
  // ── Lokasi (termasuk identitas organisasi & petugas)
  { key: "petugas", label: "Petugas", group: "Lokasi", defaultOn: true, width: 140 },
  { key: "rtuppNama", label: "RTUPP", group: "Lokasi", defaultOn: true, width: 150 },
  { key: "rtuppKode", label: "Kode RTUPP", group: "Lokasi", defaultOn: false, width: 110 },
  { key: "teamNama", label: "Team", group: "Lokasi", defaultOn: true, width: 130 },
  { key: "up3", label: "UP3", group: "Lokasi", defaultOn: false, width: 120 },
  { key: "lokasiGardu", label: "Lokasi Gardu", group: "Lokasi", defaultOn: true, width: 160 },
  { key: "pekerjaan", label: "Pekerjaan", group: "Lokasi", defaultOn: true, width: 220 },
  // ── Tim Kerja
  { key: "pelaksana", label: "Pelaksana", group: "Tim Kerja", defaultOn: true, width: 140 },
  {
    key: "penanggungJawab",
    label: "Penanggung Jawab",
    group: "Tim Kerja",
    defaultOn: true,
    width: 150,
  },
  {
    key: "pengawasPekerjaan",
    label: "Pengawas Pekerjaan",
    group: "Tim Kerja",
    defaultOn: false,
    width: 150,
  },
  {
    key: "pengawasManuver",
    label: "Pengawas Manuver",
    group: "Tim Kerja",
    defaultOn: false,
    width: 150,
  },
  { key: "pengawasK3", label: "Pengawas K3", group: "Tim Kerja", defaultOn: false, width: 140 },
  {
    key: "jumlahPersonil",
    label: "Jumlah Personil",
    group: "Tim Kerja",
    defaultOn: false,
    width: 110,
  },
  // ── K3 / Keselamatan
  { key: "potensiBahaya", label: "Potensi Bahaya", group: "K3", defaultOn: false, width: 220 },
  {
    key: "pengendalianRisiko",
    label: "Pengendalian Risiko",
    group: "K3",
    defaultOn: false,
    width: 220,
  },
  { key: "apd", label: "APD", group: "K3", defaultOn: false, width: 140 },
  { key: "rambuKerja", label: "Rambu Kerja", group: "K3", defaultOn: false, width: 140 },
  { key: "asuransiTK", label: "Asuransi TK", group: "K3", defaultOn: false, width: 140 },
  { key: "kondisiPersonil", label: "Kondisi Personil", group: "K3", defaultOn: false, width: 120 },
  { key: "apdLengkap", label: "APD Lengkap", group: "K3", defaultOn: false, width: 110 },
  {
    key: "potensiBahayaDijelaskan",
    label: "Bahaya Dijelaskan",
    group: "K3",
    defaultOn: false,
    width: 130,
  },
  {
    key: "asuransiKetenagakerjaan",
    label: "Asuransi K.",
    group: "K3",
    defaultOn: false,
    width: 120,
  },
  { key: "berdoaSebelumBekerja", label: "Berdoa", group: "K3", defaultOn: false, width: 100 },
  { key: "wpJsahirarcSop", label: "WP/JSA/SOP", group: "K3", defaultOn: false, width: 120 },
  // ── Status
  { key: "status", label: "Status Approval", group: "Status", defaultOn: true, width: 130 },
  // ── Audit
  { key: "tanggalDibuat", label: "Tgl Dibuat", group: "Audit", defaultOn: false, width: 110 },
  { key: "submittedAt", label: "Tgl Submit", group: "Audit", defaultOn: false, width: 110 },
  { key: "approvedAt", label: "Tgl Approve", group: "Audit", defaultOn: false, width: 110 },
  { key: "rejectedAt", label: "Tgl Ditolak", group: "Audit", defaultOn: false, width: 110 },
  { key: "approvedBy", label: "Disetujui Oleh", group: "Audit", defaultOn: false, width: 140 },
  { key: "rejectedBy", label: "Ditolak Oleh", group: "Audit", defaultOn: false, width: 140 },
  { key: "jumlahLampiran", label: "Lampiran", group: "Audit", defaultOn: false, width: 90 },
];

// ─── Export templates ─────────────────────────────────────────────────────────

export const EXPORT_TEMPLATES: Record<
  string,
  { label: string; description: string; columns: string[] }
> = {
  standard: {
    label: "Standard",
    description: "Identitas, petugas, lokasi, pekerjaan, tim inti, status",
    columns: [
      "reportId",
      "nomorSPJ",
      "tanggal",
      "rtuppNama",
      "teamNama",
      "petugas",
      "up3",
      "lokasiGardu",
      "pekerjaan",
      "pelaksana",
      "penanggungJawab",
      "approvedBy",
      "status",
    ],
  },
  k3: {
    label: "K3 / Keselamatan",
    description: "Standard + pengawas, personil, potensi bahaya & checklist K3",
    columns: [
      "reportId",
      "nomorSPJ",
      "nomorWP",
      "tanggal",
      "rtuppNama",
      "teamNama",
      "petugas",
      "up3",
      "lokasiGardu",
      "pekerjaan",
      "pelaksana",
      "penanggungJawab",
      "pengawasPekerjaan",
      "pengawasManuver",
      "pengawasK3",
      "jumlahPersonil",
      "potensiBahaya",
      "pengendalianRisiko",
      "apd",
      "rambuKerja",
      "asuransiTK",
      "kondisiPersonil",
      "apdLengkap",
      "potensiBahayaDijelaskan",
      "asuransiKetenagakerjaan",
      "berdoaSebelumBekerja",
      "wpJsahirarcSop",
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

function fmt(val: string | number | null | undefined) {
  if (val === null || val === undefined || val === "") return "-";
  return String(val);
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
function yn(b: boolean | null | undefined) {
  if (b === null || b === undefined) return "-";
  return b ? "Ya" : "Tidak";
}

export function getCellValue(row: RekapItem, key: string): string {
  const map: Record<string, () => string> = {
    reportId: () => fmt(row.reportId),
    nomorSPJ: () => fmt(row.nomorSPJ),
    nomorWP: () => fmt(row.nomorWP),
    hari: () => fmt(row.hari),
    tanggal: () => fmtDate(row.tanggal),
    petugas: () => fmt(row.createdBy?.name),
    rtuppNama: () => fmt(row.createdBy?.rtupp?.name),
    rtuppKode: () => fmt(row.createdBy?.rtupp?.code),
    teamNama: () => fmt(row.createdBy?.team?.name),
    up3: () => fmt(row.up3),
    lokasiGardu: () => fmt(row.lokasiGardu),
    pekerjaan: () => fmt(row.pekerjaan),
    pelaksana: () => fmt(row.pelaksana),
    penanggungJawab: () => fmt(row.penanggungJawab),
    pengawasPekerjaan: () => fmt(row.pengawasPekerjaan),
    pengawasManuver: () => fmt(row.pengawasManuver),
    pengawasK3: () => fmt(row.pengawasK3),
    jumlahPersonil: () => fmt(row.jumlahPersonil ?? 0),
    potensiBahaya: () => fmt(row.potensiBahaya),
    pengendalianRisiko: () => fmt(row.pengendalianRisiko),
    apd: () => fmt(row.apd),
    rambuKerja: () => fmt(row.rambuKerja),
    asuransiTK: () => fmt(row.asuransiTK),
    kondisiPersonil: () => fmt(row.kondisiPersonil),
    apdLengkap: () => yn(row.apdLengkap),
    potensiBahayaDijelaskan: () => yn(row.potensiBahayaDijelaskan),
    asuransiKetenagakerjaan: () => yn(row.asuransiKetenagakerjaan),
    berdoaSebelumBekerja: () => yn(row.berdoaSebelumBekerja),
    wpJsahirarcSop: () => yn(row.wpJsahirarcSop),
    status: () => fmt(row.status),
    tanggalDibuat: () => fmtDate(row.createdAt),
    submittedAt: () => fmtDate(row.submittedAt),
    approvedAt: () => fmtDate(row.approvedAt),
    rejectedAt: () => fmtDate(row.rejectedAt),
    approvedBy: () => fmt(row.approvedBy?.name),
    rejectedBy: () => fmt(row.rejectedBy?.name),
    jumlahLampiran: () => String(row._count?.attachments ?? 0),
  };
  return map[key]?.() ?? "-";
}

// ─── API functions ────────────────────────────────────────────────────────────

export const getRekap = async (params?: RekapParams): Promise<RekapResponse> => {
  const response = await apiClient.get<ApiResponse<RekapResponse>>("/rekap", { params });
  return handleResponse(response);
};

export const exportRekap = async (params?: RekapParams & { columns?: string }): Promise<void> => {
  const response = await apiClient.get("/rekap/export", { params, responseType: "blob" });
  const ts = new Date().toISOString().slice(0, 10);
  downloadBlob(response.data as Blob, `Rekap_LapAwal_${ts}.xlsx`);
};
