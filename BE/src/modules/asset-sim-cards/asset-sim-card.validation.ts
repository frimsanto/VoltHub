import { z } from 'zod';

export const createSimCardSchema = z.object({
  simSlot: z.coerce.number().int().min(1, 'simSlot wajib >= 1'),
  provider: z.string().max(100).optional().nullable(),
  phoneNumber: z.string().max(50).optional().nullable(),
  iccid: z.string().max(100).optional().nullable(),
  ipAddress: z.string().max(50).optional().nullable(),
});

export const updateSimCardSchema = createSimCardSchema.partial();

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const assetIdParamSchema = z.object({
  assetId: z.string().min(1),
});

export type CreateSimCardInput = z.infer<typeof createSimCardSchema>;
export type UpdateSimCardInput = z.infer<typeof updateSimCardSchema>;
