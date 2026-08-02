import { z } from 'zod';

export const mediaTypeEnum = z.enum([
  'GSM_4G',
  'GSM_2G',
  'RADIO_DATA',
  'FO',
  'ICON_GSM',
  'ICON_IPVPN',
]);

export const createCommunicationMediaSchema = z.object({
  locationId: z.string().min(1, 'locationId wajib diisi').max(36),
  mediaType: mediaTypeEnum,
  provider: z.string().max(150).optional().nullable(),
  status: z.boolean().optional().default(true),
  notes: z.string().optional().nullable(),
});

export const updateCommunicationMediaSchema = createCommunicationMediaSchema.partial();

export const listCommunicationMediaQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
  locationId: z.string().max(36).optional(),
  mediaType: mediaTypeEnum.optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export type CreateCommunicationMediaInput = z.infer<typeof createCommunicationMediaSchema>;
export type UpdateCommunicationMediaInput = z.infer<typeof updateCommunicationMediaSchema>;
export type ListCommunicationMediaQuery = z.infer<typeof listCommunicationMediaQuerySchema>;
