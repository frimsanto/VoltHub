import { z } from 'zod';

/**
 * Per-row schema for the Asset Excel import. Columns are resolved from the
 * sheet header (see import.parser.ts). `locationCode` is resolved to a
 * locationId by the service; `feederCode` (optional) is resolved within that
 * location. Reuses the same enums as the Assets module.
 */
export const assetImportRowSchema = z.object({
  locationCode: z.string().min(1, 'locationCode wajib diisi'),
  feederCode: z.string().optional().nullable(),
  assetType: z.enum(['RTU', 'FDI', 'RECTIFIER', 'BATTERY_BANK', 'ROUTER', 'MODEM', 'RADIO']),
  assetCode: z.string().min(1, 'assetCode wajib diisi'),
  assetName: z.string().min(1, 'assetName wajib diisi'),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  tahunOperasi: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  status: z.enum(['ACTIVE', 'WARNING', 'DAMAGED', 'RETIRED']).optional().default('ACTIVE'),
  notes: z.string().optional().nullable(),
});

/**
 * Per-row schema for the Gardu (Site) import → `locations` (locationType=GARDU).
 * The de-facto Site store is `locations`; richer Gardu columns (feeder_id,
 * rc_status, vip_status) land in the PostgreSQL restructure phase, so only the
 * columns the current MySQL schema supports are imported here. `siteCode` must
 * be globally unique (BR-004).
 */
export const garduImportRowSchema = z.object({
  siteCode: z.string().min(1, 'siteCode wajib diisi'),
  siteName: z.string().min(1, 'siteName wajib diisi'),
  up3: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
});

/**
 * Per-row schema for the SCADA RTU live-state import (csd_IFS-IFS_RTUs export).
 * Only `rtuName` is required (the correlation key); the rest are the live state
 * snapshot. Oper/Admin state are normalised to upper-case by the service.
 */
export const scadaRtuImportRowSchema = z.object({
  rtuName: z.string().min(1, 'RTU Name wajib diisi'),
  rtuText: z.string().optional().nullable(),
  operState: z.string().optional().nullable(),
  adminState: z.string().optional().nullable(),
  protocol: z.string().optional().nullable(),
  asdu: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  pairNr: z.string().optional().nullable(),
  channelPrimary: z.string().optional().nullable(),
});

export const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED']).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type AssetImportRow = z.infer<typeof assetImportRowSchema>;
export type GarduImportRow = z.infer<typeof garduImportRowSchema>;
export type ScadaRtuImportRow = z.infer<typeof scadaRtuImportRowSchema>;
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
