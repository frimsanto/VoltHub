import { z } from 'zod';

/**
 * Performance is READ-ONLY via the API. Manual entry is forbidden (BR-010);
 * data may originate only from Import or System Integration (BR-011). Hence
 * there are no create/update body schemas here — only query schemas.
 */
export const listPerformanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  // Accept either `siteId` (Gardu-centric naming) or `locationId` (physical column).
  siteId: z.string().max(36).optional(),
  locationId: z.string().max(36).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const summaryQuerySchema = z.object({
  siteId: z.string().max(36).optional(),
  locationId: z.string().max(36).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

/**
 * Per-row schema for the Performance Import (used by the import engine).
 * performanceStatus: 1 = Berhasil, 0 = Gagal (Data Dictionary). score 0–100.
 */
export const performanceImportRowSchema = z.object({
  siteCode: z.string().min(1, 'siteCode wajib diisi'),
  performanceDate: z.coerce.date({ invalid_type_error: 'performanceDate tidak valid' }),
  performanceStatus: z.coerce.number().int().refine((v) => v === 0 || v === 1, {
    message: 'performanceStatus harus 0 (Gagal) atau 1 (Berhasil)',
  }),
  score: z.coerce.number().int().min(0).max(100).optional().nullable(),
});

export type ListPerformanceQuery = z.infer<typeof listPerformanceQuerySchema>;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
export type PerformanceImportRow = z.infer<typeof performanceImportRowSchema>;
