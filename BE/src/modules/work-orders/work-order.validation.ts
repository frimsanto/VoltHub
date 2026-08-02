import { z } from 'zod';

export const WO_TYPES = ['CORRECTIVE', 'PREVENTIVE'] as const;
export const WO_STATUSES = [
  'DRAFT',
  'ASSIGNED',
  'ON_PROGRESS',
  'WAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CLOSED',
] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

// Laporan wajib yang dicentang admin saat membuat WO.
// GI/HAR → RTUPP1 (Gardu Induk), INSPEKSI_GH/HAR_GH → RTUPP2-5 (Gardu Hubung),
// INSPEKSI_MP/HAR_MP → RTUPP2-5 (Gardu Distribusi/Metering Point).
export const REQUIRED_REPORT_VALUES = ['GI', 'HAR', 'INSPEKSI_GH', 'HAR_GH', 'INSPEKSI_MP', 'HAR_MP'] as const;
export type RequiredReport = (typeof REQUIRED_REPORT_VALUES)[number];

/** Array of {GI,HAR}, de-duplicated, urutan kanonik [GI, HAR]. */
const requiredReportsSchema = z
  .array(z.enum(REQUIRED_REPORT_VALUES))
  .transform((arr) => REQUIRED_REPORT_VALUES.filter((v) => arr.includes(v)));

const nullableString = (maxLen = 36) =>
  z
    .string()
    .max(maxLen)
    .optional()
    .nullable()
    .transform((val) => (val === '' ? null : val));

export const createWorkOrderSchema = z.object({
  woNumber: z.string().max(100).optional(),
  type: z.enum(WO_TYPES),
  title: z.string().min(1, 'title wajib diisi').max(255),
  description: z.string().optional().nullable().transform((val) => (val === '' ? null : val)),
  priority: z.enum(PRIORITIES).optional().default('MEDIUM'),
  // Location hierarchy (GI required; bay/feeder/asset optional)
  locationId: z.string().min(1, 'locationId (GI) wajib diisi').max(36),
  bayId: nullableString(36),
  feederId: nullableString(36),
  assetId: nullableString(36),
  // Assignment — team only (per-individu dihapus).
  teamId: z.string().min(1, 'Tim Pelaksana wajib dipilih').max(36),
  // SCADA event source
  scadaGarduId: nullableString(36),
  scadaEventRef: nullableString(255),
  dueDate: z.coerce.date().optional().nullable(),
  // Laporan wajib (GI/HAR). FE wajib pilih ≥1; min-1 di-enforce di service
  // (perlu tahu lokasi GI). Bila tak dikirim → undefined (service yang menolak).
  requiredReports: requiredReportsSchema.optional(),
});

export const updateWorkOrderSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable().transform((val) => (val === '' ? null : val)),
  priority: z.enum(PRIORITIES).optional(),
  bayId: nullableString(36),
  feederId: nullableString(36),
  assetId: nullableString(36),
  dueDate: z.coerce.date().optional().nullable(),
  scadaEventRef: nullableString(255),
  // Ubah laporan wajib (opsional). Bila dikirim & kosong → service menolak.
  requiredReports: requiredReportsSchema.optional(),
});

export const assignWorkOrderSchema = z.object({
  teamId: z.string().min(1, 'Tim wajib dipilih').max(36),
});

const WORK_RESULTS = ['BERHASIL', 'GAGAL'] as const;
const CB_STATUSES = ['NORMAL', 'TIDAK_NORMAL'] as const;

export const workOrderResultSchema = z.object({
  hasilRC: z.enum(WORK_RESULTS).optional().nullable(),
  hasilLR: z.enum(WORK_RESULTS).optional().nullable(),
  hasilES: z.enum(WORK_RESULTS).optional().nullable(),
  statusCB: z.enum(CB_STATUSES).optional().nullable(),
  penyebab: z.string().optional().nullable(),
  tindakan: z.string().optional().nullable(),
  rekomendasi: z.string().optional().nullable(),
  assetId: nullableString(36),
});

export const rejectWorkOrderSchema = z.object({
  revisionNote: z.string().min(1, 'Catatan revisi wajib diisi'),
});

export const closeWorkOrderSchema = z.object({
  notes: z.string().optional().nullable(),
});

export const listWorkOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
  status: z.enum(WO_STATUSES).optional(),
  type: z.enum(WO_TYPES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  locationId: z.string().max(36).optional(),
  teamId: z.string().max(36).optional(),
  mine: z.coerce.boolean().optional(),
  overdue: z.coerce.boolean().optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type WorkOrderResultInput = z.infer<typeof workOrderResultSchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type AssignWorkOrderInput = z.infer<typeof assignWorkOrderSchema>;
export type RejectWorkOrderInput = z.infer<typeof rejectWorkOrderSchema>;
export type CloseWorkOrderInput = z.infer<typeof closeWorkOrderSchema>;
export type ListWorkOrderQuery = z.infer<typeof listWorkOrderQuerySchema>;
