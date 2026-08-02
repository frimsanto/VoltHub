import { z } from 'zod';

export const createAssetCategorySchema = z.object({
  name: z.string().min(1, 'name wajib diisi').max(100),
  description: z.string().max(255).optional().nullable(),
});

export const updateAssetCategorySchema = createAssetCategorySchema.partial();

export const listAssetCategoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateAssetCategoryInput = z.infer<typeof createAssetCategorySchema>;
export type UpdateAssetCategoryInput = z.infer<typeof updateAssetCategorySchema>;
export type ListAssetCategoryQuery = z.infer<typeof listAssetCategoryQuerySchema>;
