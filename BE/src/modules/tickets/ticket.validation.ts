import { z } from 'zod';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

export const createTicketSchema = z
  .object({
    siteId: z.string().max(36).optional(),
    locationId: z.string().max(36).optional(),
    ticketNumber: z.string().max(100).optional(),
    category: z.string().max(100).optional().nullable(),
    priority: z.enum(PRIORITIES).optional().default('MEDIUM'),
    assignedTo: z.string().max(36).optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .refine((d) => d.siteId || d.locationId, {
    message: 'siteId (atau locationId) wajib diisi',
    path: ['siteId'],
  });

export const updateTicketSchema = z.object({
  category: z.string().max(100).optional().nullable(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(STATUSES).optional(),
  assignedTo: z.string().max(36).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const assignTicketSchema = z.object({
  assignedTo: z.string().min(1, 'assignedTo wajib diisi').max(36),
});

export const closeTicketSchema = z.object({
  notes: z.string().optional().nullable(),
});

export const listTicketQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
  siteId: z.string().max(36).optional(),
  locationId: z.string().max(36).optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedTo: z.string().max(36).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
export type CloseTicketInput = z.infer<typeof closeTicketSchema>;
export type ListTicketQuery = z.infer<typeof listTicketQuerySchema>;
