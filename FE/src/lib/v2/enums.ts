// VoltHub V2 — enum option lists, mirroring docs/openapi.yaml.
// Single source for selects/filters so UI never drifts from the contract enums.

export const LOCATION_TYPES = ["GI", "GH", "GARDU"] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const ASSET_TYPES = [
  "RTU",
  "FDI",
  "RECTIFIER",
  "BATTERY_BANK",
  "ROUTER",
  "MODEM",
  "RADIO",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_STATUSES = ["ACTIVE", "WARNING", "DAMAGED", "RETIRED"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const MEDIA_TYPES = [
  "GSM_4G",
  "GSM_2G",
  "RADIO_DATA",
  "FO",
  "ICON_GSM",
  "ICON_IPVPN",
] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** Human labels (media codes get spaced for readability). */
export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  GSM_4G: "GSM 4G",
  GSM_2G: "GSM 2G",
  RADIO_DATA: "Radio Data",
  FO: "Fiber Optic",
  ICON_GSM: "ICON GSM",
  ICON_IPVPN: "ICON IP-VPN",
};

// ── Operations domain (Inspection / HAR / Documents) ─────────────────────────
// Mirror the backend Zod enums (BE/src/modules/{inspections,har,documents}).

export const INSPECTION_STATUSES = ["NORMAL", "WARNING", "CRITICAL"] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const HAR_STATUSES = ["NORMAL", "WARNING", "CRITICAL", "OFFLINE"] as const;
export type HarStatus = (typeof HAR_STATUSES)[number];

export const DOCUMENT_TYPES = [
  "PHOTO",
  "BERITA_ACARA",
  "MANUAL_BOOK",
  "SERTIFIKAT",
  "INSPECTION_DOC",
  "OTHER",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  PHOTO: "Foto",
  BERITA_ACARA: "Berita Acara",
  MANUAL_BOOK: "Manual Book",
  SERTIFIKAT: "Sertifikat",
  INSPECTION_DOC: "Dokumen Inspeksi",
  OTHER: "Lainnya",
};

// ── Tickets (service & maintenance) — mirror BE/src/modules/tickets ──────────
export const TICKET_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: "Rendah",
  MEDIUM: "Sedang",
  HIGH: "Tinggi",
  CRITICAL: "Kritis",
};

// ── Laporan GI (Inspeksi + HAR) — mirror BE/src/modules/{inspeksi-gi,har-gi} ──

/** Status workflow laporan GI. */
export const GI_REPORT_STATUSES = ["DRAFT", "SUBMITTED", "VALIDATED", "REJECTED"] as const;
export type GiReportStatus = (typeof GI_REPORT_STATUSES)[number];
export const GI_REPORT_STATUS_LABELS: Record<GiReportStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Menunggu Validasi",
  VALIDATED: "Tervalidasi",
  REJECTED: "Ditolak",
};

/** Kesimpulan kondisi per perangkat. */
export const GI_KESIMPULAN = ["BAIK", "PERLU_PENGECEKAN", "RUSAK", "TIDAK_ADA"] as const;
export const GI_KESIMPULAN_LABELS: Record<(typeof GI_KESIMPULAN)[number], string> = {
  BAIK: "Baik",
  PERLU_PENGECEKAN: "Perlu Pengecekan",
  RUSAK: "Rusak",
  TIDAK_ADA: "Tidak Ada",
};

/** Hasil pembanding lapangan vs master SCADA. */
export const GI_COMPARISON = ["BELUM_DIBANDING", "SESUAI", "TIDAK_SESUAI"] as const;
export type GiComparison = (typeof GI_COMPARISON)[number];
export const GI_COMPARISON_LABELS: Record<GiComparison, string> = {
  BELUM_DIBANDING: "Belum Dibanding",
  SESUAI: "Sesuai",
  TIDAK_SESUAI: "Tidak Sesuai",
};

/** Pilihan status titik kubikel (blok Relay→IED). */
export const PMT_STATUSES = ["CLOSE", "OPEN"] as const;
export const LR_STATUSES = ["LOCAL", "REMOTE"] as const;
export const ONOFF_STATUSES = ["ON", "OFF", "TIDAK_ADA"] as const;
export const HAR_GI_WORK_STATUSES = ["SELESAI", "PARSIAL", "GAGAL"] as const;

// ── Laporan GI — daftar enum DEFENSIF (mirror nilai sampel xlsx; BE menerima
// nilai di luar sampel, FE menyajikan dropdown kanonik). Selaras dengan
// BE/src/modules/laporan-gi/laporan-gi.validation.ts.
export const GI_KONDISI = ["ON", "OFF", "ON / READY", "ON / RUN", "TIDAK ADA"] as const;
export const GI_MCB_STATUS = ["ADA - ON", "ADA - OFF", "TIDAK ADA"] as const;
export const GI_DI_MASTER = ["SESUAI", "TIDAK SESUAI"] as const;
export const GI_MPUF_MASTER = ["TIMBUL", "TIDAK TIMBUL"] as const;
export const GI_CENTRALIZE = ["IYA", "TIDAK"] as const;
export const GI_ANTENA = ["ADA", "TIDAK ADA"] as const;
export const GI_KONDISI_ANTENA = ["NORMAL", "TIDAK ADA ANTENA"] as const;
export const GI_LEVEL_AIR = ["MIN", "MID (SEDANG)", "MAX"] as const;
export const GI_JUMLAH_ADA = ["TIDAK ADA", "ADA 1", "ADA 2"] as const;
export const GI_BATTERY_BACKUP = [
  "BACK UP (220 VAC OFF, RECTI ON)",
  "TIDAK BACK UP",
] as const;
export const GI_JENIS_BATERAI = ["VRLA", "NiCd", "Basah"] as const; // + "Lainnya" (teks bebas) di form

// ── Laporan HAR GI (korektif/pemeliharaan, 81 kolom xlsx) — daftar DEFENSIF.
// Mirror BE/src/modules/laporan-har-gi/laporan-har-gi.validation.ts (select-other:
// FE menyajikan dropdown kanonik, BE menerima nilai di luar sampel).
export const HAR_STATUS_GARDU = ["OOP", "INSCAN", "INVALID"] as const;
export const HAR_STATUS_PEKERJAAN = ["SELESAI", "BELUM_SELESAI", "DALAM_PROSES"] as const;
export const HAR_STATUS_PEKERJAAN_LABELS: Record<string, string> = {
  SELESAI: "Selesai",
  BELUM_SELESAI: "Belum Selesai",
  DALAM_PROSES: "Dalam Proses",
};
export const HAR_PENYEBAB = ["BATERAI", "RTU", "RTU IED", "RELAY", "MEDIA", "I/O", "CCTV"] as const;
export const HAR_KONDISI = [
  "BAIK", "ERROR", "RUSAK", "PERLU CEK LEBIH LANJUT", "TIDAK ADA", "BELUM INTEGRASI SCADA",
] as const;
export const HAR_KONDISI_CCTV = ["BAIK SEMUA", "OFF SEMUA", "OFF 1", "OFF 4"] as const;
export const HAR_JENIS_BATERAI = ["NiCAD", "VRLA", "SCM"] as const;
export const HAR_KET_KUNJUNGAN = [
  "HAR PERANGKAT SCADA",
  "PENGECEKAN & PERBAIKAN OOP",
  "PENGECEKAN & PERBAIKAN STATUS INVALID/STATUS HIJAU",
  "HAR DAN PEMASANGAN PERANGKAT SCADA",
  "HAR, PENGECEKAN & PERBAIKAN OOP",
] as const;

/** Nilai relay flag (SELARAS BE: RELAY_FLAG_VALUES = ON/OFF/"TIDAK ADA" — spasi). */
export const GI_RELAY_FLAG = ["ON", "OFF", "TIDAK ADA"] as const;
export type GiRelayFlag = (typeof GI_RELAY_FLAG)[number];

/** 32 key relay TETAP (urut & nama disepakati; mirror BE RELAY_KEYS). OBJECT keyed. */
export const GI_RELAY_KEYS = [
  "OPEN", "CLOSE", "LOCAL", "REMOTE", "ES", "RACK", "MPUF", "IEDCF", "TCS", "CCS",
  "CBTR", "GFT", "IGFT", "OCT", "IOCT", "MSF", "PSF", "CSF", "I1", "I2", "I3",
  "V1", "V2", "V3", "AMF_N", "AMF_R", "AMF_S", "AMF_T", "F", "P", "Q", "S",
] as const;
export type GiRelayKey = (typeof GI_RELAY_KEYS)[number];

/** Label tampilan relay (underscore → spasi). */
export const GI_RELAY_KEY_LABELS: Record<GiRelayKey, string> = {
  OPEN: "OPEN", CLOSE: "CLOSE", LOCAL: "LOCAL", REMOTE: "REMOTE", ES: "ES",
  RACK: "RACK IN/OUT", MPUF: "MPUF", IEDCF: "IEDCF", TCS: "TCS", CCS: "CCS",
  CBTR: "CBTR", GFT: "GFT", IGFT: "IGFT", OCT: "OCT", IOCT: "IOCT", MSF: "MSF",
  PSF: "PSF", CSF: "CSF", I1: "I1", I2: "I2", I3: "I3", V1: "V1", V2: "V2",
  V3: "V3", AMF_N: "AMF N", AMF_R: "AMF R", AMF_S: "AMF S", AMF_T: "AMF T",
  F: "F", P: "P", Q: "Q", S: "S",
};

// ── Work Order (Operation Management System GI RTUPP1) ───────────────────────
// Mirror BE/src/modules/work-orders + prisma enums.
export const WO_TYPES = ["CORRECTIVE", "PREVENTIVE"] as const;
export type WorkOrderType = (typeof WO_TYPES)[number];
export const WO_TYPE_LABELS: Record<WorkOrderType, string> = {
  CORRECTIVE: "Korektif",
  PREVENTIVE: "Preventif",
};

export const WO_STATUSES = [
  "DRAFT",
  "ASSIGNED",
  "ON_PROGRESS",
  "WAITING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "CLOSED",
] as const;
export type WorkOrderStatus = (typeof WO_STATUSES)[number];
export const WO_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  DRAFT: "Draft",
  ASSIGNED: "Ditugaskan",
  ON_PROGRESS: "Dikerjakan",
  WAITING_APPROVAL: "Menunggu Approval",
  APPROVED: "Disetujui",
  REJECTED: "Tidak Sesuai",
  CLOSED: "Selesai",
};

// Laporan Awal kondisi perangkat (Relay/RC/LR/ES/CB)
export const CHECKLIST_CONDITIONS = ["NORMAL", "ABNORMAL", "TIDAK_BEROPERASI"] as const;
export type ChecklistCondition = (typeof CHECKLIST_CONDITIONS)[number];
export const CHECKLIST_CONDITION_LABELS: Record<ChecklistCondition, string> = {
  NORMAL: "Normal",
  ABNORMAL: "Abnormal",
  TIDAK_BEROPERASI: "Tidak Beroperasi",
};

// Laporan Akhir hasil uji remote (RC/LR/ES)
export const WORK_RESULTS = ["BERHASIL", "GAGAL"] as const;
export type WorkResult = (typeof WORK_RESULTS)[number];
export const WORK_RESULT_LABELS: Record<WorkResult, string> = {
  BERHASIL: "Berhasil",
  GAGAL: "Gagal",
};

// Laporan Akhir status CB akhir
export const CB_STATUSES = ["NORMAL", "TIDAK_NORMAL"] as const;
export type CbStatus = (typeof CB_STATUSES)[number];
export const CB_STATUS_LABELS: Record<CbStatus, string> = {
  NORMAL: "Normal",
  TIDAK_NORMAL: "Tidak Normal",
};

export const toOptions = <T extends string>(values: readonly T[], labels?: Record<T, string>) =>
  values.map((v) => ({ value: v, label: labels?.[v] ?? v }));
