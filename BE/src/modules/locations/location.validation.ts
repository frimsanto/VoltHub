import { z } from 'zod';

export const locationTypeEnum = z.enum(['GI', 'GH', 'GARDU']);

export const createLocationSchema = z.object({
  // Optional: when omitted the service auto-generates a unique code from `name`
  // (the UI no longer collects a Kode — see utils/generateCode.ts).
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1, 'Name wajib diisi').max(255),
  locationType: locationTypeEnum,
  up3: z.string().max(150).optional().nullable(),
  address: z.string().optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  status: z.boolean().optional().default(true),
});

export const updateLocationSchema = createLocationSchema.partial();

export const listLocationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(500).optional().default(20),
  search: z.string().trim().optional(),
  type: locationTypeEnum.optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

/**
 * Field geo-verification (PETUGAS during a gardu visit).
 *
 * `result = CONFIRMED` → "lokasi sesuai": record the check, leave coordinates
 * untouched. `result = CORRECTED` → "tidak sesuai": the field team supplies the
 * real coordinates (typically captured from the device GPS) and the gardu's
 * position is auto-updated so the map stays current. New coordinates are
 * mandatory only for CORRECTED.
 */
export const verifyCoordinatesSchema = z
  .object({
    result: z.enum(['CONFIRMED', 'CORRECTED']),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
    // GPS horizontal accuracy in metres (navigator.geolocation), for the trail.
    accuracy: z.number().min(0).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
  })
  .refine(
    (d) => d.result !== 'CORRECTED' || (d.latitude != null && d.longitude != null),
    {
      message: 'Koordinat baru (latitude & longitude) wajib diisi saat lokasi tidak sesuai',
      path: ['latitude'],
    }
  );

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type ListLocationQuery = z.infer<typeof listLocationQuerySchema>;
export type VerifyCoordinatesInput = z.infer<typeof verifyCoordinatesSchema>;
