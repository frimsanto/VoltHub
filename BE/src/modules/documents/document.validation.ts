import { z } from 'zod';

export const documentTypeEnum = z.enum([
  'PHOTO',
  'BERITA_ACARA',
  'MANUAL_BOOK',
  'SERTIFIKAT',
  'INSPECTION_DOC',
  'OTHER',
]);

// Multipart text fields arrive as strings; file is handled by multer.
export const createDocumentSchema = z
  .object({
    locationId: z.string().max(36).optional().nullable(),
    assetId: z.string().max(36).optional().nullable(),
    documentType: documentTypeEnum,
    documentName: z.string().max(255).optional(),
  })
  .refine((d) => d.locationId || d.assetId, {
    message: 'Minimal salah satu dari locationId atau assetId wajib diisi',
    path: ['locationId'],
  });

export const listDocumentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
  locationId: z.string().max(36).optional(),
  assetId: z.string().max(36).optional(),
  documentType: documentTypeEnum.optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type ListDocumentQuery = z.infer<typeof listDocumentQuerySchema>;
