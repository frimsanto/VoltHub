import { z } from 'zod';

export const createOrganizationSchema = z.object({
  code: z.string().min(1, 'code wajib diisi').max(50),
  name: z.string().min(1, 'name wajib diisi').max(255),
});

export const updateOrganizationSchema = createOrganizationSchema.partial();

export const listOrganizationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type ListOrganizationQuery = z.infer<typeof listOrganizationQuerySchema>;
