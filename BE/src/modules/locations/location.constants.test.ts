import { describe, it, expect } from 'vitest';
import {
  isRtupp1,
  isLocationTypeAllowedForRtupp,
  allowedTypesForRtupp,
} from './location.constants';

describe('isRtupp1 — RTUPP1 (GIS) detection (mirrors FE rtupp.isRtupp1User)', () => {
  it('matches RTUPP1 by code/name variants', () => {
    expect(isRtupp1({ code: 'RTUPP1' })).toBe(true);
    expect(isRtupp1({ name: 'RTUPP 1' })).toBe(true);
    expect(isRtupp1({ code: 'RTUPP-01' })).toBe(true);
    expect(isRtupp1({ name: 'RTUPP1 GIS Jakarta' })).toBe(true);
  });

  it('does NOT match RTUPP2–5 or RTUPP10..19', () => {
    expect(isRtupp1({ code: 'RTUPP2' })).toBe(false);
    expect(isRtupp1({ name: 'RTUPP 5' })).toBe(false);
    expect(isRtupp1({ code: 'RTUPP10' })).toBe(false);
    expect(isRtupp1(null)).toBe(false);
    expect(isRtupp1(undefined)).toBe(false);
  });
});

describe('Per-RTUPP gardu-type rule (Acceptance a & b)', () => {
  const rtupp1 = { code: 'RTUPP1', name: 'RTUPP 1 GIS' };
  const rtupp3 = { code: 'RTUPP3', name: 'RTUPP 3' };

  // (a) RTUPP1 + GH/MP(GARDU) → ditolak; RTUPP1 + GI → diterima
  it('a. RTUPP1 allows only GI', () => {
    expect(isLocationTypeAllowedForRtupp(rtupp1, 'GI')).toBe(true);
    expect(isLocationTypeAllowedForRtupp(rtupp1, 'GH')).toBe(false);
    expect(isLocationTypeAllowedForRtupp(rtupp1, 'GARDU')).toBe(false); // GARDU = MP
    expect(allowedTypesForRtupp(rtupp1)).toEqual(['GI']);
  });

  // (b) RTUPP3 + GI → ditolak; RTUPP3 + GH dan + MP(GARDU) → diterima
  it('b. RTUPP2–5 allow GH and GARDU(MP) but not GI', () => {
    expect(isLocationTypeAllowedForRtupp(rtupp3, 'GI')).toBe(false);
    expect(isLocationTypeAllowedForRtupp(rtupp3, 'GH')).toBe(true);
    expect(isLocationTypeAllowedForRtupp(rtupp3, 'GARDU')).toBe(true);
    expect(allowedTypesForRtupp(rtupp3)).toEqual(['GH', 'GARDU']);
  });
});
