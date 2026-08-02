import { z } from 'zod';
import { SOURCE_TYPES, REPORT_FORMATS } from './report.templates';

/** Unified generate: any source + any format (Enterprise Report Generator). */
export const generateSchema = z.object({
  sourceType: z.enum(SOURCE_TYPES),
  sourceId: z.string().min(1, 'sourceId wajib diisi').max(36),
  format: z.enum(REPORT_FORMATS).optional().default('PDF'),
});

// Back-compat schemas (legacy inspection/HAR PDF endpoints).
export const generateInspectionSchema = z.object({
  inspectionId: z.string().min(1, 'inspectionId wajib diisi').max(36),
});
export const generateHarSchema = z.object({
  harReportId: z.string().min(1, 'harReportId wajib diisi').max(36),
});

export const listGeneratedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  locationId: z.string().max(36).optional(),
  reportType: z.string().max(50).optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
  sourceId: z.string().max(36).optional(),
  format: z.enum(REPORT_FORMATS).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type GenerateInput = z.infer<typeof generateSchema>;
export type GenerateInspectionInput = z.infer<typeof generateInspectionSchema>;
export type GenerateHarInput = z.infer<typeof generateHarSchema>;
export type ListGeneratedQuery = z.infer<typeof listGeneratedQuerySchema>;
