import { z } from 'zod';

export const inspectionStatusEnum = z.enum(['NORMAL', 'WARNING', 'CRITICAL']);

export const createInspectionSchema = z.object({
  locationId: z.string().min(1, 'locationId wajib diisi').max(36),
  inspectionDate: z.string().min(1, 'inspectionDate wajib diisi'),
  notes: z.string().optional().nullable(),
});

export const createFindingSchema = z.object({
  assetId: z.string().min(1, 'assetId wajib diisi').max(36),
  status: inspectionStatusEnum,
  finding: z.string().optional().nullable(),
  recommendation: z.string().optional().nullable(),
});

export const createPhotoSchema = z.object({
  caption: z.string().max(255).optional().nullable(),
});

export const listInspectionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  locationId: z.string().max(36).optional(),
  search: z.string().max(100).optional(),
  // Inclusive inspection-date range (YYYY-MM-DD). Either bound is optional.
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;
export type CreateFindingInput = z.infer<typeof createFindingSchema>;
export type CreatePhotoInput = z.infer<typeof createPhotoSchema>;
export type ListInspectionQuery = z.infer<typeof listInspectionQuerySchema>;
