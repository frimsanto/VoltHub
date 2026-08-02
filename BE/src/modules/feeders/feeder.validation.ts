import { z } from 'zod';

export const createFeederSchema = z.object({
  locationId: z.string().min(1, 'locationId wajib diisi').max(36),
  // Optional: auto-generated from feederName when omitted (see utils/generateCode.ts).
  feederCode: z.string().min(1).max(50).optional(),
  feederName: z.string().min(1, 'feederName wajib diisi').max(255),
});

export const updateFeederSchema = createFeederSchema.partial();

export const listFeederQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
  locationId: z.string().max(36).optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export type CreateFeederInput = z.infer<typeof createFeederSchema>;
export type UpdateFeederInput = z.infer<typeof updateFeederSchema>;
export type ListFeederQuery = z.infer<typeof listFeederQuerySchema>;
