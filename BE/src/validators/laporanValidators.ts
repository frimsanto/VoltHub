import { z } from 'zod';

// Common schemas
export const ReportStatusEnum = z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'REVISED']);

// Work Order domain enums (Operation Management System GI RTUPP1)
export const ChecklistConditionEnum = z.enum(['NORMAL', 'ABNORMAL', 'TIDAK_BEROPERASI']);
export const WorkResultEnum = z.enum(['BERHASIL', 'GAGAL']);
export const CbStatusEnum = z.enum(['NORMAL', 'TIDAK_NORMAL']);

// Personil Snapshot schema (for audit trail)
const personilSnapshotSchema = z.object({
  personilId: z.string(),
  nama: z.string(),
  jabatan: z.string().optional(),
  rtuppId: z.string(),
  rtuppName: z.string(),
});

// Laporan Awal Schema - PLN Operational Structure with Personil Snapshot
export const createLaporanAwalSchema = z.object({
  hari: z.string().min(1, 'Hari wajib diisi'),
  tanggal: z.string().min(1, 'Tanggal wajib diisi'),
  nomorSPJ: z.string().optional().default('-'),
  up3: z.string().min(1, 'UP3 wajib diisi'),
  pekerjaan: z.string().min(1, 'Pekerjaan wajib diisi'),
  lokasiGardu: z.string().min(1, 'Lokasi gardu wajib diisi'),

  pelaksana: z.string().optional(),
  penanggungJawab: z.string().optional(),

  pengawasPekerjaan: z.string().optional().nullable(),
  pengawasManuver: z.string().optional().nullable(),
  pengawasK3: z.string().optional().nullable(),
  nomorWP: z.string().optional().nullable(),

  potensiBahaya: z.string().optional().default('-'),
  pengendalianRisiko: z.string().optional().default('-'),
  apd: z.string().optional().nullable(),
  rambuKerja: z.string().optional().nullable(),
  asuransiTK: z.string().optional().nullable(),

  status: ReportStatusEnum.optional().default('PENDING'),

  // Work Order link + kondisi perangkat checklist (Relay/RC/LR/ES/CB)
  workOrderId: z.string().max(36).optional().nullable(),
  cekRelay: ChecklistConditionEnum.optional().nullable(),
  cekRC: ChecklistConditionEnum.optional().nullable(),
  cekLR: ChecklistConditionEnum.optional().nullable(),
  cekES: ChecklistConditionEnum.optional().nullable(),
  cekStatusCB: ChecklistConditionEnum.optional().nullable(),

  rtuppId: z.string().optional().nullable(),
  teamId: z.string().optional().nullable(),
  jumlahPersonil: z.number().optional().nullable(),
  personilSnapshot: z.array(z.any()).optional().nullable(),

  wpJsahirarcSop: z.boolean().optional(),
  kondisiPersonil: z.string().optional(),
  potensiBahayaDijelaskan: z.boolean().optional(),
  apdLengkap: z.boolean().optional(),
  asuransiKetenagakerjaan: z.boolean().optional(),
  berdoaSebelumBekerja: z.boolean().optional(),

  safety: z.any().optional().nullable(),
  attachments: z.any().optional().nullable(),
}).passthrough();

export const updateLaporanAwalSchema = createLaporanAwalSchema.partial();

// Laporan Akhir Schema - PLN Operational Structure with Detailed Fields
const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

export const createLaporanAkhirSchema = z.object({
  // Basic Info
  laporanAwalId: z.string().uuid().optional(),
  tanggalSelesai: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
  jenisPekerjaan: z.string().min(1, 'Jenis pekerjaan wajib diisi'),
  
  // Location Info
  up3: z.string().min(1, 'UP3 wajib diisi'),
  rtupp: z.string().optional(),
  gardu: z.string().min(1, 'Gardu wajib diisi'),
  
  // Technical Info
  asdu: z.string().regex(/^\d{1,10}$/, 'ASDU harus angka 1-10 digit').optional(),
  ipModem: z.string().regex(ipRegex, 'Format IP tidak valid').optional().or(z.literal('')),
  ipRTU: z.string().regex(ipRegex, 'Format IP tidak valid').optional().or(z.literal('')),
  ipSIM1: z.string().regex(ipRegex, 'Format IP tidak valid').optional().or(z.literal('')),
  ipSIM2: z.string().regex(ipRegex, 'Format IP tidak valid').optional().or(z.literal('')),
  ipGTWIconPlus: z.string().regex(ipRegex, 'Format IP tidak valid').optional().or(z.literal('')),
  ipWAN: z.string().regex(ipRegex, 'Format IP tidak valid').optional().or(z.literal('')),
  
  // Aset SCADA - Split into Nama and Type
  rtuNama: z.string().min(1, 'Nama RTU wajib diisi'),
  rtuType: z.string().min(1, 'Type RTU wajib diisi'),
  mediaNama: z.string().min(1, 'Nama Media wajib diisi'),
  mediaType: z.string().min(1, 'Type Media wajib diisi'),
  rectifierNama: z.string().min(1, 'Nama Rectifier wajib diisi'),
  rectifierType: z.string().min(1, 'Type Rectifier wajib diisi'),
  bateraiNama: z.string().min(1, 'Nama Baterai wajib diisi'),
  bateraiType: z.string().min(1, 'Type Baterai wajib diisi'),
  
  // Pekerjaan Detail
  langkahPekerjaan: z.string().min(10, 'Langkah pekerjaan minimal 10 karakter'),
  hasilPekerjaan: z.string().min(5, 'Hasil pekerjaan minimal 5 karakter'),
  
  // Catatan Perangkat - Enums
  catatanRTU: z.enum(['NORMAL', 'RUSAK']).default('NORMAL'),
  catatanMedia: z.enum(['NORMAL', 'RUSAK']).default('NORMAL'),
  catatanRectifier: z.enum(['NORMAL', 'RUSAK']).default('NORMAL'),
  catatanBaterai: z.enum(['NORMAL', 'HATI_HATI', 'RUSAK']).default('NORMAL'),
  catatanLain: z.string().optional(),
  
  // Status - Enums
  statusSebelum: z.enum(['APPDISK', 'GAGAL_RC', 'OOP', 'INSCAN', 'BERHASIL_RC', 'LAIN_LAIN']),
  statusSesudah: z.enum(['APPDISK', 'GAGAL_RC', 'OOP', 'INSCAN', 'BERHASIL_RC', 'LAIN_LAIN']),
  statusPekerjaan: z.enum(['SELESAI', 'PARSIAL', 'GAGAL']).default('SELESAI'),
  
  // Work Order link + hasil uji remote checklist (RC/LR/ES/CB) + analisis
  workOrderId: z.string().max(36).optional().nullable(),
  hasilRC: WorkResultEnum.optional().nullable(),
  hasilLR: WorkResultEnum.optional().nullable(),
  hasilES: WorkResultEnum.optional().nullable(),
  statusCB: CbStatusEnum.optional().nullable(),
  penyebab: z.string().optional().nullable(),
  tindakan: z.string().optional().nullable(),
  rekomendasi: z.string().optional().nullable(),

  // Penutup
  pengawas: z.string().min(1, 'Pengawas wajib diisi'),
  pelaksana: z.string().min(1, 'Pelaksana wajib diisi'),
  
  // Legacy fields (optional for compatibility)
  nomorSPJ: z.string().optional(),
  pekerjaan: z.string().optional(),
  namaAset: z.string().optional(),
  tagSCADA: z.string().optional(),
  bayPosisi: z.string().optional(),
  teganganNominal: z.string().optional(),
  detailLangkah: z.string().optional(),
  hasilTahananIsolasi: z.string().optional(),
  hasilPengukuranBeban: z.string().optional(),
  catatanHasil: z.string().optional(),
  durasiPekerjaan: z.string().optional(),
  catatanTambahan: z.string().optional(),
  
  status: ReportStatusEnum.optional().default('DRAFT'),
});

export const updateLaporanAkhirSchema = createLaporanAkhirSchema.partial();

// Validation/Approval Schema
export const validateReportSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'REVISION_REQUESTED']),
  notes: z.string().optional(),
});

// History Query Schema
export const historyQuerySchema = z.object({
  jenis: z.enum(['AWAL', 'AKHIR', 'ALL']).optional().default('ALL'),
  status: ReportStatusEnum.optional(),
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default('10'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdBy: z.string().uuid().optional(),
});

// Types
export type CreateLaporanAwalInput = z.infer<typeof createLaporanAwalSchema>;
export type UpdateLaporanAwalInput = z.infer<typeof updateLaporanAwalSchema>;
export type CreateLaporanAkhirInput = z.infer<typeof createLaporanAkhirSchema>;
export type UpdateLaporanAkhirInput = z.infer<typeof updateLaporanAkhirSchema>;
export type ValidateReportInput = z.infer<typeof validateReportSchema>;
export type HistoryQueryInput = z.infer<typeof historyQuerySchema>;
