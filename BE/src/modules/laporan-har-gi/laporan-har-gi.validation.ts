import { z } from 'zod';

/**
 * Laporan HAR GI — validation (Zod, per-section). FASE B. Pola mengikuti Laporan GI:
 *  - status inti (statusGarduSebelum/Sesudah, statusPekerjaan) = kolom SCALAR (string
 *    bebas, defensif — boleh di luar sampel; TIDAK di-hard-reject).
 *  - penyebabGangguan = ARRAY string (multi → chips FE).
 *  - Section absentable membawa flag { tidakAda: true } → field-nya di-skip dari
 *    validasi "wajib" saat submit (pengecekan di service layer).
 *  - WAJIB ber-WO: workOrderId wajib (identitas diturunkan dari WO).
 */

// ── Daftar nilai (referensi/mirror FE; defensif — bukan DB enum) ─────────────
export const HAR_STATUS_GARDU = ['OOP', 'INSCAN', 'INVALID'] as const;
export const HAR_STATUS_PEKERJAAN = ['SELESAI', 'BELUM_SELESAI', 'DALAM_PROSES'] as const;
export const HAR_PENYEBAB = ['BATERAI', 'RTU', 'RTU IED', 'RELAY', 'MEDIA', 'I/O', 'CCTV'] as const;

/** Section yang boleh absen (flag { tidakAda: true }). */
export const HAR_ABSENTABLE_SECTIONS = [
  'serialDevice', // device2 via device2TidakAda
  'cctvBullet',
  'cctvPtz',
  'cctvNvr',
  'cctvSwitchPoe',
] as const;

// ── Helper kecil ─────────────────────────────────────────────────────────────
const optStr = (max = 255) =>
  z.string().max(max).optional().nullable().transform((v) => (v === '' ? null : v));
const optScalar = optStr(50);

/** Tanggal pekerjaan tidak boleh di masa depan (backdating diizinkan). */
const notFutureDate = (d: Date) => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return d.getTime() <= end.getTime();
};
const reportDateSchema = z.coerce.date().refine(notFutureDate, {
  message: 'Tanggal pekerjaan tidak boleh di masa depan',
});

/** Section perangkat umum (passthrough → forward-compatible). */
const looseSection = z
  .object({
    tidakAda: z.boolean().optional(),
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
  })
  .passthrough()
  .optional()
  .nullable();

/** CCTV: bullet/ptz/nvr/switchPoe — masing-masing section perangkat (absentable). */
const cctvSection = z
  .object({
    bullet: looseSection,
    ptz: looseSection,
    nvr: looseSection,
    switchPoe: looseSection,
  })
  .passthrough()
  .optional()
  .nullable();

/** Penanganan: blok teks (analisa/langkah/hasil/tambahan/catatanLain). */
const penangananSection = z
  .object({
    analisa: optStr(4000),
    langkah: optStr(8000),
    hasil: optStr(8000),
    tambahan: optStr(4000),
    catatanLain: optStr(4000),
  })
  .passthrough()
  .optional()
  .nullable();

/** penyebabGangguan: array string (multi). Defensif: nilai bebas. */
const penyebabSchema = z.array(z.string().max(100)).optional().nullable();

// ── Field bersama (create & update) ──────────────────────────────────────────
const sectionFields = {
  ketKunjungan: optStr(255),
  pengawas: optStr(255),
  scadaRtuName: optStr(255),

  // Status inti PROMOTED ke scalar.
  statusGarduSebelum: optScalar,
  statusGarduSesudah: optScalar,
  statusPekerjaan: optScalar,
  penyebabGangguan: penyebabSchema,

  // Payload per-section (JSON).
  io: looseSection,
  relay: looseSection,
  rectifier: looseSection,
  baterai: looseSection,
  serialDevice: serialDeviceSection,
  cctv: cctvSection,
  penanganan: penangananSection,
};

export const createLaporanHarGiSchema = z.object({
  // WAJIB ber-WO: identitas (lokasi/penyulang/aset/up3/pelaksana) diturunkan dari WO.
  workOrderId: z.string().min(1, 'workOrderId wajib (Laporan HAR GI selalu ber-Work Order)').max(36),
  feederId: z.string().max(36).optional().nullable(),
  reportDate: reportDateSchema,
  pelaksana: optStr(255),
  ...sectionFields,
});

export const updateLaporanHarGiSchema = z.object({
  feederId: z.string().max(36).optional().nullable(),
  reportDate: reportDateSchema.optional(),
  pelaksana: optStr(255),
  ...sectionFields,
});

export const decideLaporanHarGiSchema = z.object({
  decision: z.enum(['VALIDATED', 'REJECTED']),
  validationNote: z.string().max(2000).optional().nullable(),
}).refine((d) => d.decision !== 'REJECTED' || !!d.validationNote, {
  message: 'Catatan wajib diisi saat menolak laporan',
  path: ['validationNote'],
});

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === '' || val === null || val === undefined ? undefined : val), schema);

export const listLaporanHarGiQuerySchema = z.object({
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

export type CreateLaporanHarGiInput = z.infer<typeof createLaporanHarGiSchema>;
export type UpdateLaporanHarGiInput = z.infer<typeof updateLaporanHarGiSchema>;
export type DecideLaporanHarGiInput = z.infer<typeof decideLaporanHarGiSchema>;
export type ListLaporanHarGiQuery = z.infer<typeof listLaporanHarGiQuerySchema>;
