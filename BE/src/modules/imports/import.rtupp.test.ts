import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Heavy deps are stubbed so the test exercises ONLY the import engine's per-row
// error handling around the per-RTUPP gardu-type rule.
vi.mock('../../config/database');
vi.mock('fs', () => ({
  default: { mkdirSync: vi.fn(), writeFileSync: vi.fn() },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
vi.mock('../../utils/auditLog', () => ({ recordAuditLog: vi.fn() }));
vi.mock('../../utils/tenantScope', () => ({
  resolveScopeForUserId: vi.fn(),
  rtuppInScope: vi.fn(),
}));
vi.mock('./import.parser', () => ({
  parseGarduWorkbook: vi.fn(),
  parseAssetWorkbook: vi.fn(),
  parsePerformanceWorkbook: vi.fn(),
  parseScadaRtuWorkbook: vi.fn(),
}));
vi.mock('../locations/location.service', () => ({ locationService: { create: vi.fn() } }));

import { ImportService } from './import.service';
import { ImportRepository } from './import.repository';
import { resolveScopeForUserId } from '../../utils/tenantScope';
import { parseGarduWorkbook } from './import.parser';
import { locationService } from '../locations/location.service';
import { ValidationError } from '../../utils/appError';

beforeEach(() => vi.clearAllMocks());

describe('importGardu — per-RTUPP rule produces row-level errors (Acceptance c)', () => {
  it('captures the bad-RTUPP row as an ImportError while valid rows still import', async () => {
    // Fake repo: capture saved errors + the final job summary, no DB.
    const savedErrors: { rowNumber: number; errorMessage: string }[] = [];
    let finalized: Record<string, unknown> | null = null;
    const repo = {
      createJob: vi.fn().mockResolvedValue({ id: 'job-1' }),
      saveErrors: vi.fn(async (_id: string, errs: typeof savedErrors) => {
        savedErrors.push(...errs);
      }),
      finalizeJob: vi.fn(async (_id: string, result: Record<string, unknown>) => {
        finalized = result;
      }),
      findById: vi.fn().mockResolvedValue({ id: 'job-1', status: 'SUCCESS' }),
    } as unknown as ImportRepository;

    (resolveScopeForUserId as Mock).mockResolvedValue({ global: false, rtuppId: 'rtupp-1' });
    // Mixed batch: one allowed gardu, one that violates the RTUPP rule.
    (parseGarduWorkbook as Mock).mockResolvedValue([
      { rowNumber: 2, data: { siteCode: 'G-OK', siteName: 'Gardu Distribusi OK' } },
      { rowNumber: 3, data: { siteCode: 'G-BAD', siteName: 'Gardu Salah RTUPP' } },
    ]);
    // The real enforcer is locationService.create; here it rejects G-BAD with the
    // same 422 the per-RTUPP rule raises, and accepts G-OK.
    (locationService.create as Mock).mockImplementation(async (input: { code: string }) => {
      if (input.code === 'G-BAD') {
        throw new ValidationError(
          'RTUPP1 hanya untuk Gardu Induk (GI). Gardu "G-BAD" berjenis GARDU tidak diperbolehkan.',
        );
      }
      return { id: 'loc-ok' };
    });

    const svc = new ImportService(repo);
    await svc.importGardu('gardu.xlsx', Buffer.from('x'), 'u1');

    // Valid row imported, bad row captured — batch did NOT abort.
    expect((locationService.create as Mock)).toHaveBeenCalledTimes(2);
    expect(savedErrors).toHaveLength(1);
    expect(savedErrors[0].rowNumber).toBe(3);
    expect(savedErrors[0].errorMessage).toContain('G-BAD');
    expect(finalized).toMatchObject({
      totalRows: 2,
      successRows: 1,
      failedRows: 1,
      status: 'SUCCESS',
    });
  });
});
