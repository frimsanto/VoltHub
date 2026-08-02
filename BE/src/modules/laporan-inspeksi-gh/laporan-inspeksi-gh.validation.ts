import { z } from 'zod';

export const optStr = (max = 255) =>
  z.string().max(max).optional().nullable().transform((v) => (v === '' ? null : v));
export const optScalar = optStr(50);

const notFutureDate = (d: Date) => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return d.getTime() <= end.getTime();
};

export const reportDateSchema = z.coerce.date().refine(notFutureDate, {
  message: 'Tanggal pekerjaan tidak boleh di masa depan',
});

export const looseSection = z
  .object({
    tidakAda: z.boolean().optional(),
    kesimpulan: optScalar,
    keterangan: optStr(2000),
  })
  .passthrough()
  .optional()
  .nullable();

// ── KUBIKEL DINAMIS PER PENYULANG ──────────────────────────────────────────
// Array; tiap entri = 1 penyulang. penyulangId:null ⇒ entri MANUAL (teks murni,
// TIDAK pernah create feeder/location master). Status fields dibiarkan string
// defensif (bukan enum strict) agar tidak menolak nilai lapangan; kewajiban
// minimal ditegakkan saat submit (assertSubmittable), bukan saat DRAFT/create.
// relayDetail OPSIONAL (Inspeksi & HAR sama).
const cubMaster = z
  .object({ cubicle: optScalar, master: optScalar })
  .partial()
  .passthrough()
  .optional()
  .nullable();

export const relayDetailSchema = z
  .object({
    cbtr: cubMaster,
    gft: cubMaster,
    igft: cubMaster,
    oct: cubMaster,
    ioct: cubMaster,
    bebanI1: cubMaster,
    bebanI2: cubMaster,
    bebanI3: cubMaster,
    amfN: cubMaster,
    amfR: cubMaster,
    amfS: cubMaster,
    amfT: cubMaster,
  })
  .partial()
  .passthrough()
  .optional()
  .nullable();

export const kubikelEntrySchema = z.object({
  penyulangId: z.string().max(36).optional().nullable(), // null = manual (teks)
  namaPenyulang: z.string().min(1, 'Nama penyulang wajib').max(255),
  merekCubicle: optStr(255),
  tipeRc: optScalar,               // CBO / LBS
  statusCubicle: optScalar,        // OPEN / CLOSE
  statusCubicleMaster: optScalar,  // OPEN / CLOSE
  statusLrCubicle: optScalar,      // LOCAL / REMOTE / INVALID
  statusLrMaster: optScalar,
  mfsCubicle: optScalar,
  mfsMaster: optScalar,
  hfdCubicle: optScalar,
  hfdMaster: optScalar,
  testRcDummy: optScalar,
  statusRc: optScalar,             // SIAP RC / TIDAK SIAP RC
  catatan: optStr(2000),
  relayDetail: relayDetailSchema,  // OPSIONAL
});

// kubikel bisa absen saat DRAFT (min-1 ditegakkan saat submit).
export const kubikelArraySchema = z.array(kubikelEntrySchema).max(200).optional().nullable();

const sectionFields = {
  supplyTr: looseSection,
  rectifier: looseSection,
  baterai: looseSection,
  rtu: looseSection,
  media1: looseSection,
  media2: looseSection,
  kubikel: kubikelArraySchema,
  fdiRelay: looseSection,
  aco: looseSection,

  notes: optStr(4000),
  catatan: optStr(4000),
};

// workOrderId WAJIB. Identitas (locationId/feederId/up3/pelaksana) TIDAK diterima
// dari FE — di-auto-fill server-side dari WO (anti-spoof).
export const createLaporanInspeksiGhSchema = z.object({
  workOrderId: z.string().min(1, 'workOrderId wajib').max(36),
  reportDate: reportDateSchema,
  ...sectionFields,
});

// Identitas auto dari WO — tidak dapat diubah lewat update. Hanya isi laporan.
export const updateLaporanInspeksiGhSchema = z.object({
  reportDate: reportDateSchema.optional(),
  ...sectionFields,
});

// Feeders milik satu GH (dropdown penyulang, scoped RTUPP).
export const feedersByGhQuerySchema = z.object({
  locationId: z.string().min(1, 'locationId (GH) wajib').max(36),
});

export const decideLaporanInspeksiGhSchema = z.object({
  decision: z.enum(['VALIDATED', 'REJECTED']),
  validationNote: z.string().max(2000).optional().nullable(),
}).refine((d) => d.decision !== 'REJECTED' || !!d.validationNote, {
  message: 'Catatan wajib diisi saat menolak laporan',
  path: ['validationNote'],
});

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === '' || val === null || val === undefined ? undefined : val), schema);

export const listLaporanInspeksiGhQuerySchema = z.object({
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

export type CreateLaporanInspeksiGhInput = z.infer<typeof createLaporanInspeksiGhSchema>;
export type UpdateLaporanInspeksiGhInput = z.infer<typeof updateLaporanInspeksiGhSchema>;
export type DecideLaporanInspeksiGhInput = z.infer<typeof decideLaporanInspeksiGhSchema>;
export type ListLaporanInspeksiGhQuery = z.infer<typeof listLaporanInspeksiGhQuerySchema>;
export type KubikelEntry = z.infer<typeof kubikelEntrySchema>;
export type FeedersByGhQuery = z.infer<typeof feedersByGhQuerySchema>;
