import { z } from 'zod';
import {
  optStr,
  optScalar,
  reportDateSchema,
  looseSection,
  kubikelArraySchema,
} from '../laporan-inspeksi-mp/laporan-inspeksi-mp.validation';

const sectionFields = {
  statusGarduSebelum: optScalar,
  statusGarduSesudah: optScalar,
  statusPekerjaan: optScalar,
  penyebabGangguan: z.array(z.string()).optional().nullable(),

  supplyTr: looseSection,
  rectifier: looseSection,
  baterai: looseSection,
  rtu: looseSection,
  media1: looseSection,
  media2: looseSection,
  kubikel: kubikelArraySchema, // sama seperti Inspeksi MP (array dinamis per gardu)
  fdiRelay: looseSection,
  aco: looseSection,
  penanganan: looseSection,

  notes: optStr(4000),
  catatan: optStr(4000),
};

// workOrderId WAJIB; identitas auto server-side dari WO (anti-spoof).
export const createLaporanHarMpSchema = z.object({
  workOrderId: z.string().min(1, 'workOrderId wajib').max(36),
  reportDate: reportDateSchema,
  ...sectionFields,
});

export const updateLaporanHarMpSchema = z.object({
  reportDate: reportDateSchema.optional(),
  ...sectionFields,
});

export const decideLaporanHarMpSchema = z.object({
  decision: z.enum(['VALIDATED', 'REJECTED']),
  validationNote: z.string().max(2000).optional().nullable(),
}).refine((d) => d.decision !== 'REJECTED' || !!d.validationNote, {
  message: 'Catatan wajib diisi saat menolak laporan',
  path: ['validationNote'],
});

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === '' || val === null || val === undefined ? undefined : val), schema);

export const listLaporanHarMpQuerySchema = z.object({
  page: emptyToUndefined(z.coerce.number().int().min(1).optional().default(1)),
  limit: emptyToUndefined(z.coerce.number().int().min(1).max(100).optional().default(20)),
  search: z.string().trim().optional(),
  status: emptyToUndefined(z.enum(['DRAFT', 'SUBMITTED', 'VALIDATED', 'REJECTED']).optional()),
  locationId: emptyToUndefined(z.string().max(36).optional()),
  workOrderId: emptyToUndefined(z.string().max(36).optional()),
  mine: emptyToUndefined(z.coerce.boolean().optional()),
  dateFrom: emptyToUndefined(z.coerce.date().optional()),
  dateTo: emptyToUndefined(z.coerce.date().optional()),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateLaporanHarMpInput = z.infer<typeof createLaporanHarMpSchema>;
export type UpdateLaporanHarMpInput = z.infer<typeof updateLaporanHarMpSchema>;
export type DecideLaporanHarMpInput = z.infer<typeof decideLaporanHarMpSchema>;
export type ListLaporanHarMpQuery = z.infer<typeof listLaporanHarMpQuerySchema>;
