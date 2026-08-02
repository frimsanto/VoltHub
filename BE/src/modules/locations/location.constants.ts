import type { LocationType } from '@prisma/client';

/**
 * Per-RTUPP gardu-type rule — the SINGLE source of truth shared by the Location
 * service (interactive create/update) and the import engine. No new enum is
 * introduced: it constrains the existing `LocationType` (GI | GH | GARDU).
 *
 * Business rule:
 *   - RTUPP1 (the GIS unit)  → only GI (Gardu Induk).
 *   - RTUPP2–RTUPP5          → only GH and GARDU. "MP" in the field notes maps
 *                              to the GARDU LocationType (gardu distribusi).
 *
 * RTUPP1 is detected exactly like the frontend (lib/v2/rtupp.isRtupp1User):
 * by its RTUPP code/name matching "RTUPP1", or its name containing "GIS"
 * (legacy data). Kept deliberately in sync — one rule, two runtimes.
 */

export type RtuppRef = { code?: string | null; name?: string | null } | null | undefined;

const normalize = (s?: string | null): string => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Matches RTUPP1 / RTUPP-1 / RTUPP 1 / RTUPP01 — but NOT RTUPP10..RTUPP19.
const RTUPP1_RE = /^RTUPP0*1$/;

/** True when the RTUPP is RTUPP1 (the GIS / Gardu Induk unit). */
export function isRtupp1(rtupp: RtuppRef): boolean {
  if (!rtupp) return false;
  if (RTUPP1_RE.test(normalize(rtupp.code)) || RTUPP1_RE.test(normalize(rtupp.name))) return true;
  return (rtupp.name ?? '').toUpperCase().includes('GIS');
}

/** Gardu types allowed for the RTUPP1 (GIS) unit. */
export const RTUPP1_ALLOWED_TYPES: readonly LocationType[] = ['GI'];
/** Gardu types allowed for RTUPP2–RTUPP5 (GH + GARDU/MP). */
export const RTUPP_OTHER_ALLOWED_TYPES: readonly LocationType[] = ['GH', 'GARDU'];

/** The allowed `LocationType`s for the given RTUPP. */
export function allowedTypesForRtupp(rtupp: RtuppRef): readonly LocationType[] {
  return isRtupp1(rtupp) ? RTUPP1_ALLOWED_TYPES : RTUPP_OTHER_ALLOWED_TYPES;
}

/** Whether a gardu of `type` may exist under the given RTUPP. */
export function isLocationTypeAllowedForRtupp(rtupp: RtuppRef, type: LocationType): boolean {
  return allowedTypesForRtupp(rtupp).includes(type);
}

/** Human-readable rule for the given RTUPP (used in 422 / row-error messages). */
export function locationTypeRuleMessage(rtupp: RtuppRef): string {
  return isRtupp1(rtupp)
    ? 'RTUPP1 hanya untuk Gardu Induk (GI).'
    : 'RTUPP2–5 hanya untuk Gardu Hubung (GH) dan Gardu Distribusi (MP/GARDU).';
}
