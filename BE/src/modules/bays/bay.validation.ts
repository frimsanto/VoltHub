import { z } from 'zod';

export const createBaySchema = z.object({
  locationId: z.string().min(1, 'locationId (GI) wajib diisi').max(36),
  code: z.string().min(1, 'code wajib diisi').max(50),
  name: z.string().min(1, 'name wajib diisi').max(255),
  voltageLevel: z.string().max(50).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const updateBaySchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(255).optional(),
  voltageLevel: z.string().max(50).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const listBayQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
  locationId: z.string().max(36).optional(),
  isActive: z.coerce.boolean().optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateBayInput = z.infer<typeof createBaySchema>;
export type UpdateBayInput = z.infer<typeof updateBaySchema>;
export type ListBayQuery = z.infer<typeof listBayQuerySchema>;
