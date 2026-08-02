import { z } from 'zod';

/**
 * Laporan GI — validation (Zod, per-section).
 *
 * Mengikuti Excel terbaru:
 *  - rtuIo menggantikan rtuConcentrator & rtuIed.
 *  - media dihapus sepenuhnya.
 *  - kubikel menyimpan elements.{PMT, LR, ES, ...} dengan 3 kolom (relay, cubicle, master).
 */

export const GI_KESIMPULAN = ['BAIK', 'PERLU_PENGECEKAN', 'RUSAK', 'TIDAK_ADA'] as const;
export const RELAY_FLAG_VALUES = ['ON', 'OFF', 'TIDAK ADA'] as const;

export const KUBIKEL_ELEMENT_KEYS = [
  'PMT', 'LR', 'ES', 'RACK', 'MPUF', 'IEDCF', 'TCS', 'CCS', 'CBTR', 'GFT', 'IGFT',
  'OCT', 'IOCT', 'MSF', 'PSF', 'CSF', 'I1', 'I2', 'I3', 'V1', 'V2', 'V3',
  'AMF_N', 'AMF_R', 'AMF_S', 'AMF_T', 'F', 'P', 'Q', 'S',
] as const;
export type KubikelElementKey = (typeof KUBIKEL_ELEMENT_KEYS)[number];

const optStr = (max = 255) =>
  z.string().max(max).optional().nullable().transform((v) => (v === '' ? null : v));
const optScalar = optStr(50);

/** Tanggal pekerjaan tidak boleh di masa depan (backdating diizinkan). */
const notFutureDate = (d: Date) => {
  const end = new Date();
  end.setHours(23, 59, 59, 999); // toleransi sampai akhir hari ini (zona server)
  return d.getTime() <= end.getTime();
};
const reportDateSchema = z.coerce.date().refine(notFutureDate, {
  message: 'Tanggal pekerjaan tidak boleh di masa depan',
});

const relayStatusEnum = z.union([z.enum(RELAY_FLAG_VALUES), z.literal(''), z.null()]).optional();

const pmtElementSchema = z.object({
  relayOpen: relayStatusEnum,
  relayClose: relayStatusEnum,
  cubicle: optScalar,
  master: optScalar,
  hasilRc: optScalar,
}).optional().nullable();

const lrElementSchema = z.object({
  relayLocal: relayStatusEnum,
  relayRemote: relayStatusEnum,
  cubicle: optScalar,
  master: optScalar,
}).optional().nullable();

const genericElementSchema = z.object({
  relay: relayStatusEnum,
  cubicle: optScalar,
  master: optScalar,
}).optional().nullable();

const kubikelElementsSchema = z.object({
  PMT: pmtElementSchema,
  LR: lrElementSchema,
  ES: genericElementSchema,
  RACK: genericElementSchema,
  MPUF: genericElementSchema,
  IEDCF: genericElementSchema,
  TCS: genericElementSchema,
  CCS: genericElementSchema,
  CBTR: genericElementSchema,
  GFT: genericElementSchema,
  IGFT: genericElementSchema,
  OCT: genericElementSchema,
  IOCT: genericElementSchema,
  MSF: genericElementSchema,
  PSF: genericElementSchema,
  CSF: genericElementSchema,
  I1: genericElementSchema,
  I2: genericElementSchema,
  I3: genericElementSchema,
  V1: genericElementSchema,
  V2: genericElementSchema,
  V3: genericElementSchema,
  AMF_N: genericElementSchema,
  AMF_R: genericElementSchema,
  AMF_S: genericElementSchema,
  AMF_T: genericElementSchema,
  F: genericElementSchema,
  P: genericElementSchema,
  Q: genericElementSchema,
  S: genericElementSchema,
}).optional().nullable();

/** Kubikel: elements + kesimpulan/keterangan/merek. */
const kubikelSection = z
  .object({
    merekCubicle: optStr(255),
    elements: kubikelElementsSchema,
    kesimpulan: optScalar,
    keterangan: optStr(2000),
  })
  .passthrough()
  .optional()
  .nullable();

/** Section umum (passthrough agar field perangkat bebas/forward-compatible). */
const looseSection = z
  .object({
    tidakAda: z.boolean().optional(),
    kesimpulan: optScalar,
    keterangan: optStr(2000),
  })
  .passthrough()
  .optional()
  .nullable();

/** RTU I/O: merk, type, sn, kondisi, mcb, hasilUkurMcb, keterangan, kesimpulan. */
const rtuIoSection = z
  .object({
    merk: optStr(255),
    type: optStr(255),
    serialNumber: optStr(255),
    kondisi: optScalar,
    mcb: optScalar,
    hasilUkurMcb: z.union([z.coerce.number(), z.string(), z.null()]).optional(),
    kesimpulan: optScalar,
    keterangan: optStr(2000),
  })
  .passthrough()
  .optional()
  .nullable();

/** Serial Device: utama + device ke-2 (absen via device2TidakAda). */
const serialDeviceSection = z
  .object({
    jumlah: optScalar,
    utama: looseSection,
    device2: looseSection,
    device2TidakAda: z.boolean().optional(),
    kesimpulan: optScalar,
    keterangan: optStr(2000),
  })
  .passthrough()
  .optional()
  .nullable();

// ── Field bersama (create & update) ──────────────────────────────────────────
const sectionFields = {
  // Payload per-section (JSON).
  rectifier: looseSection,
  rectifierBackup: looseSection,
  baterai: looseSection,
  serialDevice: serialDeviceSection,
  rtuIo: rtuIoSection,
  kubikel: kubikelSection,
  relayProteksi: looseSection,

  notes: optStr(4000),
  catatan: optStr(4000),
  scadaRtuName: optStr(255),
};

export const createLaporanGiSchema = z.object({
  locationId: z.string().max(36).optional().nullable(),
  feederId: z.string().max(36).optional().nullable(),
  workOrderId: z.string().max(36).optional().nullable(),
  reportDate: reportDateSchema,
  pelaksana: optStr(255),
  ...sectionFields,
}).refine((d) => !!d.locationId || !!d.workOrderId, {
  message: 'locationId (GI) wajib diisi bila tanpa workOrderId',
  path: ['locationId'],
});

export const updateLaporanGiSchema = z.object({
  feederId: z.string().max(36).optional().nullable(),
  reportDate: reportDateSchema.optional(),
  pelaksana: optStr(255),
  ...sectionFields,
});

export const decideLaporanGiSchema = z.object({
  decision: z.enum(['VALIDATED', 'REJECTED']),
  validationNote: z.string().max(2000).optional().nullable(),
}).refine((d) => d.decision !== 'REJECTED' || !!d.validationNote, {
  message: 'Catatan wajib diisi saat menolak laporan',
  path: ['validationNote'],
});

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === '' || val === null || val === undefined ? undefined : val), schema);

export const listLaporanGiQuerySchema = z.object({
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

export type CreateLaporanGiInput = z.infer<typeof createLaporanGiSchema>;
export type UpdateLaporanGiInput = z.infer<typeof updateLaporanGiSchema>;
export type DecideLaporanGiInput = z.infer<typeof decideLaporanGiSchema>;
export type ListLaporanGiQuery = z.infer<typeof listLaporanGiQuerySchema>;
