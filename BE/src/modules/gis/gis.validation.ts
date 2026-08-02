import { z } from 'zod';

/**
 * GIS query validation.
 *
 * Every spatial endpoint shares the same optional filter vocabulary so the map
 * client can drive panning/zooming/filtering with one consistent contract.
 * `validate(...,'query')` coerces and bounds the input before it reaches the
 * service, so the repository always sees a clean, parameter-safe shape.
 */

/** Canonical operational layer ids exposed by the GIS module. */
export const GIS_LAYERS = ['gardu', 'penyulang', 'asset', 'inspection', 'report', 'team'] as const;
export type GisLayer = (typeof GIS_LAYERS)[number];

/**
 * `bbox=minLng,minLat,maxLng,maxLat` — the viewport rectangle. Pushing this to
 * SQL is the single most important optimization for large datasets: the map
 * only ever fetches the sites currently on screen.
 */
const bboxSchema = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw) return undefined;
    const parts = raw.split(',').map((n) => Number(n.trim()));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bbox must be "minLng,minLat,maxLng,maxLat"' });
      return z.NEVER;
    }
    const [minLng, minLat, maxLng, maxLat] = parts;
    if (minLat > maxLat || minLng > maxLng) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bbox min must be <= max' });
      return z.NEVER;
    }
    return { minLng, minLat, maxLng, maxLat };
  });

/** `layers=gardu,report` — comma list of layer ids to include (default: all). */
const layersSchema = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw) return [...GIS_LAYERS];
    const ids = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const invalid = ids.filter((id) => !GIS_LAYERS.includes(id as GisLayer));
    if (invalid.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown layer(s): ${invalid.join(', ')}` });
      return z.NEVER;
    }
    return ids as GisLayer[];
  });

/** Shared filters applied to the site substrate. */
const baseFilters = {
  bbox: bboxSchema,
  type: z.enum(['GI', 'GH', 'GARDU']).optional(),
  up3: z.string().trim().min(1).max(150).optional(),
  search: z.string().trim().min(1).max(255).optional(),
  /** Only return sites with at least one open work order (Reports layer). */
  openTickets: z.coerce.boolean().optional(),
};

export const featuresQuerySchema = z.object({
  ...baseFilters,
  layers: layersSchema,
  /** Hard cap on returned features (the FE clusters the rest server-side). */
  limit: z.coerce.number().int().min(1).max(5000).default(2000),
});

export const heatmapQuerySchema = z.object({
  bbox: bboxSchema,
  type: z.enum(['GI', 'GH', 'GARDU']).optional(),
  up3: baseFilters.up3,
  /** Heat weight source. */
  metric: z.enum(['sites', 'assets', 'tickets', 'inspections']).default('tickets'),
});

export const clustersQuerySchema = z.object({
  bbox: bboxSchema,
  type: z.enum(['GI', 'GH', 'GARDU']).optional(),
  up3: baseFilters.up3,
  /** Map zoom level (0–22). Lower zoom → coarser grid cell → fewer clusters. */
  zoom: z.coerce.number().int().min(0).max(22).default(6),
});

export const idParamSchema = z.object({ id: z.string().uuid() });

export type FeaturesQuery = z.infer<typeof featuresQuerySchema>;
export type HeatmapQuery = z.infer<typeof heatmapQuerySchema>;
export type ClustersQuery = z.infer<typeof clustersQuerySchema>;
export type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };
