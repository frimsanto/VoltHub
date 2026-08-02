import { z } from 'zod';

/**
 * Validation for the SCADA real-time (INS/OOP) dashboard endpoints.
 * `type` selects the gardu population — the realtime dashboard defaults to RC,
 * the only population the control room actively polls.
 */
export const SCADA_TYPES = ['RC', 'GH', 'GI', 'GFD'] as const;

export const summaryQuerySchema = z.object({
  type: z.enum(SCADA_TYPES).default('RC'),
});

export const garduQuerySchema = z.object({
  type: z.enum(SCADA_TYPES).default('RC'),
  status: z.enum(['IN_SCAN', 'OOP']).optional(),
  search: z.string().trim().min(1).max(150).optional(),
  rtupp: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
export type GarduQuery = z.infer<typeof garduQuerySchema>;
