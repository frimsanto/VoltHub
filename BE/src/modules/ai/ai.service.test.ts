import { describe, it, expect, vi } from 'vitest';
import { AiService } from './ai.service';
import type { AiRepository } from './ai.repository';
import type { TenantScope } from '../../utils/tenantScope';

// Security regression test (HIGH tenant-scoping gap in the legacy AI module —
// GET /ai/assets/search + the search_gardu tool used to resolve ANY location
// in the whole DB regardless of the caller's RTUPP). ai.repository.ts now
// takes the caller's scope and applies locationScopeWhere/viaLocationScopeWhere
// the same way location.repository.ts / inspection.repository.ts do; this
// fake repo mimics that DB-level filtering so the service is exercised the
// same way a real scoped Prisma query would behave.

const scopeFor = (rtuppId: string): TenantScope => ({ global: false, rtuppId });
const GLOBAL: TenantScope = { global: true, rtuppId: null };

interface FixtureLocation {
  id: string;
  code: string;
  name: string;
  locationType: string;
  up3: string;
  rtuppId: string;
}

const GARDU_RTUPP3: FixtureLocation = {
  id: 'loc-rtupp3',
  code: 'GARDU-RTUPP3',
  name: 'Gardu RTUPP3',
  locationType: 'GARDU',
  up3: 'UP3-X',
  rtuppId: 'rtupp-3',
};

/** Mimics locationScopeWhere: global sees everything, scoped only their own RTUPP. */
function makeRepo(fixtures: FixtureLocation[]) {
  const resolveLocation = vi.fn(async (q: string, scope: TenantScope) => {
    const inScope = fixtures.filter((l) => scope.global || l.rtuppId === scope.rtuppId);
    return inScope.find((l) => l.code === q) ?? null;
  });
  return {
    resolveLocation,
    assetsOfLocation: vi.fn().mockResolvedValue([]),
    communicationMediaOfLocation: vi.fn().mockResolvedValue([]),
    lastInspection: vi.fn().mockResolvedValue(null),
    lastHar: vi.fn().mockResolvedValue(null),
    documentCount: vi.fn().mockResolvedValue(0),
  } as unknown as AiRepository & {
    resolveLocation: ReturnType<typeof vi.fn>;
    assetsOfLocation: ReturnType<typeof vi.fn>;
    communicationMediaOfLocation: ReturnType<typeof vi.fn>;
    lastInspection: ReturnType<typeof vi.fn>;
    lastHar: ReturnType<typeof vi.fn>;
    documentCount: ReturnType<typeof vi.fn>;
  };
}

describe('AiService.searchAssets — tenant scope isolation', () => {
  it('scope RTUPP2 does NOT resolve a gardu that belongs to RTUPP3', async () => {
    const repo = makeRepo([GARDU_RTUPP3]);
    const svc = new AiService(repo);
    await expect(svc.searchAssets('GARDU-RTUPP3', scopeFor('rtupp-2'))).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('scope RTUPP3 (own tenant) resolves the same gardu successfully', async () => {
    const repo = makeRepo([GARDU_RTUPP3]);
    const svc = new AiService(repo);
    const result = await svc.searchAssets('GARDU-RTUPP3', scopeFor('rtupp-3'));
    expect(result.location.code).toBe('GARDU-RTUPP3');
  });

  it('GLOBAL scope (MASTER/MANAGER) resolves a gardu from any RTUPP', async () => {
    const repo = makeRepo([GARDU_RTUPP3]);
    const svc = new AiService(repo);
    const result = await svc.searchAssets('GARDU-RTUPP3', GLOBAL);
    expect(result.location.code).toBe('GARDU-RTUPP3');
  });

  it('forwards the exact same scope to every child aggregate call (defense-in-depth)', async () => {
    const repo = makeRepo([GARDU_RTUPP3]);
    const svc = new AiService(repo);
    const scope = scopeFor('rtupp-3');
    await svc.searchAssets('GARDU-RTUPP3', scope);

    expect(repo.assetsOfLocation).toHaveBeenCalledWith('loc-rtupp3', scope);
    expect(repo.communicationMediaOfLocation).toHaveBeenCalledWith('loc-rtupp3', scope);
    expect(repo.lastInspection).toHaveBeenCalledWith('loc-rtupp3', scope);
    expect(repo.lastHar).toHaveBeenCalledWith('loc-rtupp3', scope);
    expect(repo.documentCount).toHaveBeenCalledWith('loc-rtupp3', scope);
  });
});
