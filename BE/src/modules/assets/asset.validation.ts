import { z } from 'zod';

export const assetTypeEnum = z.enum([
  'RTU',
  'FDI',
  'RECTIFIER',
  'BATTERY_BANK',
  'ROUTER',
  'MODEM',
  'RADIO',
]);

export const assetStatusEnum = z.enum(['ACTIVE', 'WARNING', 'DAMAGED', 'RETIRED']);

export const createAssetSchema = z.object({
  locationId: z.string().min(1, 'locationId wajib diisi').max(36),
  feederId: z.string().max(36).optional().nullable(),
  parentAssetId: z.string().max(36).optional().nullable(),
  assetType: assetTypeEnum,
  // Optional: auto-generated from assetName when omitted (see utils/generateCode.ts).
  assetCode: z.string().min(1).max(100).optional(),
  assetName: z.string().min(1, 'assetName wajib diisi').max(255),
  brand: z.string().max(150).optional().nullable(),
  model: z.string().max(150).optional().nullable(),
  serialNumber: z.string().max(150).optional().nullable(),
  tahunOperasi: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  status: assetStatusEnum.optional().default('ACTIVE'),
  notes: z.string().optional().nullable(),

  // RTU specific
  protocol: z.string().max(100).optional().nullable(),
  asdu: z.string().max(100).optional().nullable(),
  linkAddress: z.string().max(100).optional().nullable(),
  pairChannel: z.string().max(100).optional().nullable(),
  masterIp1: z.string().max(50).optional().nullable(),
  masterIp2: z.string().max(50).optional().nullable(),

  // Battery specific
  batteryCount: z.coerce.number().int().min(0).optional().nullable(),
  capacity: z.string().max(100).optional().nullable(),
});

export const updateAssetSchema = createAssetSchema.partial();

export const listAssetQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
  assetType: assetTypeEnum.optional(),
  locationId: z.string().max(36).optional(),
  status: assetStatusEnum.optional(),
  // Live SCADA comm-state filter (UP / DOWN). Upper-cased to match stored values.
  operState: z.string().trim().toUpperCase().optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type ListAssetQuery = z.infer<typeof listAssetQuerySchema>;
