import { describe, it, expect, vi } from 'vitest';
import { LocationService } from './location.service';
import type { LocationRepository } from './location.repository';
import type { TenantScope } from '../../utils/tenantScope';

// A scoped operator pinned to a specific RTUPP. The service stamps the new gardu
// with scope.rtuppId, then validates the type against that RTUPP.
const scopeFor = (rtuppId: string): TenantScope => ({ global: false, rtuppId });
const GLOBAL: TenantScope = { global: true, rtuppId: null };

// Minimal fake repository: only the methods the service touches in these paths.
function makeRepo(rtupp: { code?: string; name?: string } | null) {
  return {
    findByCode: vi.fn().mockResolvedValue(null),
    findRtupp: vi.fn().mockResolvedValue(rtupp),
    findById: vi.fn(),
    findSupplyFeeder: vi.fn().mockResolvedValue(null),
    findUserRtuppId: vi.fn().mockResolvedValue(null),
    create: vi.fn(async (data: unknown) => ({ id: 'loc-1', ...(data as object) })),
    update: vi.fn(async (_id: string, data: unknown) => ({ id: 'loc-1', ...(data as object) })),
  } as unknown as LocationRepository & {
    findRtupp: ReturnType<typeof vi.fn>;
    findUserRtuppId: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
}

describe('LocationService.create — per-RTUPP gardu-type rule (5B)', () => {
  it('rejects GARDU under RTUPP1 with a 422 (no create)', async () => {
    const repo = makeRepo({ code: 'RTUPP1', name: 'RTUPP 1 GIS' });
    const svc = new LocationService(repo);
    await expect(
      svc.create({ name: 'X', locationType: 'GARDU', code: 'G1' } as never, 'u1', scopeFor('rtupp-1')),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect((repo as never as { create: ReturnType<typeof vi.fn> }).create).not.toHaveBeenCalled();
  });

  it('accepts GI under RTUPP1', async () => {
    const repo = makeRepo({ code: 'RTUPP1', name: 'RTUPP 1 GIS' });
    const svc = new LocationService(repo);
    await expect(
      svc.create({ name: 'GI Grogol', locationType: 'GI', code: 'GI1' } as never, 'u1', scopeFor('rtupp-1')),
    ).resolves.toMatchObject({ id: 'loc-1' });
  });

  it('rejects GI under RTUPP3 with a 422', async () => {
    const repo = makeRepo({ code: 'RTUPP3', name: 'RTUPP 3' });
    const svc = new LocationService(repo);
    await expect(
      svc.create({ name: 'X', locationType: 'GI', code: 'G3' } as never, 'u1', scopeFor('rtupp-3')),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('accepts GH and GARDU(MP) under RTUPP3', async () => {
    const repo = makeRepo({ code: 'RTUPP3', name: 'RTUPP 3' });
    const svc = new LocationService(repo);
    await expect(
      svc.create({ name: 'GH', locationType: 'GH', code: 'GH3' } as never, 'u1', scopeFor('rtupp-3')),
    ).resolves.toMatchObject({ id: 'loc-1' });
    await expect(
      svc.create({ name: 'MP', locationType: 'GARDU', code: 'MP3' } as never, 'u1', scopeFor('rtupp-3')),
    ).resolves.toMatchObject({ id: 'loc-1' });
  });

  it('skips the rule for a global creator with no own RTUPP (no RTUPP stamped)', async () => {
    const repo = makeRepo(null);
    const svc = new LocationService(repo);
    await expect(
      svc.create({ name: 'GI', locationType: 'GI', code: 'GIX' } as never, 'u1', GLOBAL),
    ).resolves.toMatchObject({ id: 'loc-1' });
    expect((repo as never as { findRtupp: ReturnType<typeof vi.fn> }).findRtupp).not.toHaveBeenCalled();
  });

  it('a global-scope ADMIN with an own RTUPP still stamps it (never tenant-orphaned)', async () => {
    const repo = makeRepo({ code: 'RTUPP3', name: 'RTUPP 3' });
    repo.findUserRtuppId.mockResolvedValue('rtupp-3');
    const svc = new LocationService(repo);
    await expect(
      svc.create({ name: 'GH', locationType: 'GH', code: 'GHX' } as never, 'admin-1', GLOBAL),
    ).resolves.toMatchObject({ id: 'loc-1' });
    expect(repo.create).toHaveBeenCalledWith(expect.anything(), 'admin-1', 'rtupp-3');
  });
});

describe('LocationService.update — per-RTUPP gardu-type rule (5B)', () => {
  it('rejects changing a RTUPP1 gardu type to GARDU (422)', async () => {
    const repo = makeRepo({ code: 'RTUPP1', name: 'RTUPP 1 GIS' });
    (repo as never as { findById: ReturnType<typeof vi.fn> }).findById.mockResolvedValue({
      id: 'loc-1',
      code: 'GI1',
      locationType: 'GI',
      rtuppId: 'rtupp-1',
    });
    const svc = new LocationService(repo);
    await expect(
      svc.update('loc-1', { locationType: 'GARDU' } as never, 'u1', scopeFor('rtupp-1')),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect((repo as never as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled();
  });
});
