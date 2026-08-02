import { z } from 'zod';

export const harStatusEnum = z.enum(['NORMAL', 'WARNING', 'CRITICAL', 'OFFLINE']);

export const createHarReportSchema = z.object({
  locationId: z.string().min(1, 'locationId wajib diisi').max(36),
  reportDate: z.string().min(1, 'reportDate wajib diisi'),
});

export const createHarDetailSchema = z.object({
  assetId: z.string().min(1, 'assetId wajib diisi').max(36),
  status: harStatusEnum,
  analysis: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateHarDetailSchema = z.object({
  status: harStatusEnum.optional(),
  analysis: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const listHarQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  locationId: z.string().max(36).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export const detailParamsSchema = z.object({
  id: z.string().min(1),
  detailId: z.string().min(1),
});

export type CreateHarReportInput = z.infer<typeof createHarReportSchema>;
export type CreateHarDetailInput = z.infer<typeof createHarDetailSchema>;
export type UpdateHarDetailInput = z.infer<typeof updateHarDetailSchema>;
export type ListHarQuery = z.infer<typeof listHarQuerySchema>;
