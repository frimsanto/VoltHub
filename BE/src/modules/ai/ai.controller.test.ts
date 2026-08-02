import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth';

vi.mock('./ai.service', () => ({
  aiService: { searchAssets: vi.fn() },
}));
vi.mock('../../utils/tenantScope', () => ({
  resolveRequestScope: vi.fn(),
}));

import { aiController } from './ai.controller';
import { aiService } from './ai.service';
import { resolveRequestScope } from '../../utils/tenantScope';

const mockedSearchAssets = aiService.searchAssets as unknown as ReturnType<typeof vi.fn>;
const mockedResolveScope = resolveRequestScope as unknown as ReturnType<typeof vi.fn>;

function makeRes(): Response {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
}

// Security regression test: GET /ai/assets/search used to call aiService.searchAssets
// with no scope at all (global by omission). The controller must now ALWAYS resolve
// scope from the authenticated request first and fail closed — never fall back to an
// unscoped/global call — when scope resolution itself fails (e.g. a scoped user with
// no rtuppId, per resolveRequestScope's fail-closed contract).
describe('AiController.searchAssets — fail-closed scope resolution', () => {
  beforeEach(() => {
    mockedSearchAssets.mockReset();
    mockedResolveScope.mockReset();
  });

  it('never calls the (potentially global) service before scope resolves — propagates the error via next()', async () => {
    const scopeError = Object.assign(new Error('Akun Anda belum terhubung ke RTUPP.'), { statusCode: 403 });
    mockedResolveScope.mockRejectedValue(scopeError);
    const req = { user: { userId: 'u1', role: 'PETUGAS' }, query: { q: 'PM46' } } as unknown as AuthRequest;
    const res = makeRes();
    const next = vi.fn();

    await aiController.searchAssets(req, res, next);

    expect(mockedSearchAssets).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(scopeError);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('threads the resolved scope into aiService.searchAssets — not called unscoped', async () => {
    const scope = { global: false, rtuppId: 'rtupp-2' };
    mockedResolveScope.mockResolvedValue(scope);
    mockedSearchAssets.mockResolvedValue({ location: { code: 'PM46' } });
    const req = { user: { userId: 'u1', role: 'ADMIN', rtuppId: 'rtupp-2' }, query: { q: 'PM46' } } as unknown as AuthRequest;
    const res = makeRes();
    const next = vi.fn();

    await aiController.searchAssets(req, res, next);

    expect(mockedSearchAssets).toHaveBeenCalledWith('PM46', scope);
    expect(next).not.toHaveBeenCalled();
  });
});
