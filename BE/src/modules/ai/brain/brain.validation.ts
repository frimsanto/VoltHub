import { z } from 'zod';
import type { IntentId } from './brain.types';

// NOTE: must list EVERY IntentId member — `satisfies z.ZodType<IntentId>` does
// NOT catch omissions (a subset enum still satisfies it). KPI_SCADA was once
// missing here, so its clarify picks 422'd while the Brain itself offered them.
const intentEnum = z.enum([
  'NAVIGATE',
  'ASSET_SEARCH',
  'REPORT_SEARCH',
  'KPI_COUNT',
  'KPI_SCADA',
  'GIS_SEARCH',
  'LOCATION_DETAIL',
  'OPERATIONAL_INSIGHT',
  'EQUIPMENT_INSPECTION_SUMMARY',
  'EQUIPMENT_INSPECTION_PROBLEMS',
  'EQUIPMENT_INSPECTION_BRANDS',
  'EQUIPMENT_INSPECTION_DETAIL',
  'HAR_SUMMARY',
  'HAR_MERK_RUSAK',
  'SMALLTALK',
  'UNKNOWN',
]) satisfies z.ZodType<IntentId>;

const slotsSchema = z
  .object({
    status: z.string().max(60).optional(),
    entity: z.string().max(60).optional(),
    place: z.string().max(120).optional(),
    time: z.string().max(60).optional(),
    keyword: z.string().max(120).optional(),
  })
  .strict();

/** POST /ai/brain — main natural-language turn. */
export const brainTurnSchema = z.object({
  message: z.string().trim().min(1, 'Pesan tidak boleh kosong').max(2000),
  sessionId: z.string().trim().max(64).optional(),
  channel: z.enum(['in_app', 'whatsapp', 'voice']).optional(),
  locale: z.enum(['id', 'en']).optional(),
});
export type BrainTurnBody = z.infer<typeof brainTurnSchema>;

/** POST /ai/brain/clarify — execute a user's clarification pick (Phase 4). */
export const brainClarifySchema = z.object({
  intent: intentEnum,
  slots: slotsSchema,
  message: z.string().trim().max(2000).optional(),
  sessionId: z.string().trim().max(64).optional(),
  channel: z.enum(['in_app', 'whatsapp', 'voice']).optional(),
  locale: z.enum(['id', 'en']).optional(),
});
export type BrainClarifyBody = z.infer<typeof brainClarifySchema>;

/** POST /ai/brain/feedback — thumbs up/down on a turn (Phase 7). */
export const brainFeedbackSchema = z.object({
  conversationId: z.string().trim().min(1).max(36),
  rating: z.number().int().min(-1).max(1),
  note: z.string().trim().max(1000).optional(),
});
export type BrainFeedbackBody = z.infer<typeof brainFeedbackSchema>;