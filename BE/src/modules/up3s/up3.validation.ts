import { z } from 'zod';

export const createUp3Schema = z.object({
  rtuppId: z.string().min(1, 'rtuppId wajib diisi').max(36),
  code: z.string().min(1, 'code wajib diisi').max(50),
  name: z.string().min(1, 'name wajib diisi').max(255),
});

export const updateUp3Schema = createUp3Schema.partial();

export const listUp3QuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
  rtuppId: z.string().max(36).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateUp3Input = z.infer<typeof createUp3Schema>;
export type UpdateUp3Input = z.infer<typeof updateUp3Schema>;
export type ListUp3Query = z.infer<typeof listUp3QuerySchema>;
