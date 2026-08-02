import { z } from 'zod';

export const createAssetTypeSchema = z.object({
  assetCategoryId: z.string().min(1, 'assetCategoryId wajib diisi').max(36),
  name: z.string().min(1, 'name wajib diisi').max(100),
  description: z.string().max(255).optional().nullable(),
});

export const updateAssetTypeSchema = createAssetTypeSchema.partial();

export const listAssetTypeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
  assetCategoryId: z.string().max(36).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateAssetTypeInput = z.infer<typeof createAssetTypeSchema>;
export type UpdateAssetTypeInput = z.infer<typeof updateAssetTypeSchema>;
export type ListAssetTypeQuery = z.infer<typeof listAssetTypeQuerySchema>;
