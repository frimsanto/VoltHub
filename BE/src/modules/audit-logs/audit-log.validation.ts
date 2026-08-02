import { z } from 'zod';

/**
 * Audit logs are READ-ONLY (BR-018: audit log must not be edited by any role,
 * including SUPER ADMIN). Only query schemas exist — no create/update/delete.
 */
export const listAuditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  entityType: z.string().max(100).optional(),
  entityId: z.string().max(36).optional(),
  action: z.enum(['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE']).optional(),
  performedBy: z.string().max(36).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;
