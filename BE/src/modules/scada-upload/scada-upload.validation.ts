import { z } from 'zod';

/**
 * Validation for the SCADA snapshot endpoints (Siemens SP7 daily export).
 * `fileType` selects which of the two exports a request targets:
 *   RTU   — csd_IFS-IFS_RTUs*.xlsx  (per-gardu RTU state)
 *   LINES — csd_IFS-IFS_Lines*.xlsx (per-channel IFS state)
 */
export const SCADA_FILE_TYPES = ['RTU', 'LINES'] as const;
export type ScadaFileType = (typeof SCADA_FILE_TYPES)[number];

/** UP = Inscan, DOWN = OOP; NONE = baris tanpa Oper State (slot UNASG, Lines
 *  saja); ALL disables the filter. */
export const OPER_STATE_FILTER = ['UP', 'DOWN', 'NONE', 'ALL'] as const;

export const uploadBodySchema = z.object({
  fileType: z.enum(SCADA_FILE_TYPES),
  notes: z.string().trim().max(500).optional(),
});

export const latestQuerySchema = z.object({
  fileType: z.enum(SCADA_FILE_TYPES).default('RTU'),
});

export const rtuQuerySchema = z.object({
  search: z.string().trim().min(1).max(150).optional(),
  operState: z.enum(OPER_STATE_FILTER).default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const linesQuerySchema = z.object({
  search: z.string().trim().min(1).max(150).optional(),
  operState: z.enum(OPER_STATE_FILTER).default('ALL'),
  ifsServer: z.string().trim().min(1).max(50).optional(),
  channelId: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type UploadBody = z.infer<typeof uploadBodySchema>;
export type LatestQuery = z.infer<typeof latestQuerySchema>;
export type RtuQuery = z.infer<typeof rtuQuerySchema>;
export type LinesQuery = z.infer<typeof linesQuerySchema>;
