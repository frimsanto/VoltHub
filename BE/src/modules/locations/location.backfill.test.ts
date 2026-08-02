import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runBackfill } from '../../../prisma/backfill-gi-rtupp';

describe('runBackfill GI Locations to RTUPP1', () => {
  const mockRtupp1 = { id: 'rtupp-1-uuid', code: 'RTUPP-1', name: 'RTUPP 1' };
  const mockRtuppOther = { id: 'rtupp-other-uuid', code: 'JAKSEL', name: 'UP3 Jakarta Selatan' };

  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      rTUPP: {
        findMany: vi.fn().mockResolvedValue([mockRtupp1, mockRtuppOther]),
      },
      location: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => {
        // Simple transaction wrapper simulation
        const tx = {
          location: {
            updateMany: vi.fn().mockResolvedValue({ count: 5 }),
          },
        };
        const res = await cb(tx);
        return res;
      }),
    };
  });

  it('throws an error if RTUPP1 is not found', async () => {
    mockDb.rTUPP.findMany.mockResolvedValue([mockRtuppOther]);

    await expect(runBackfill(mockDb, [])).rejects.toThrow('RTUPP1 not found in database. Cannot proceed.');
  });

  it('performs dry-run by default without writing to the database', async () => {
    mockDb.location.findMany.mockResolvedValue([
      { id: 'loc-1', code: 'GI-1', name: 'GI One', locationType: 'GI', rtuppId: 'rtupp-other-uuid' },
      { id: 'loc-2', code: 'GI-2', name: 'GI Two', locationType: 'GI', rtuppId: null },
      { id: 'loc-3', code: 'GI-3', name: 'GI Three', locationType: 'GI', rtuppId: 'rtupp-1-uuid' },
    ]);

    const result = await runBackfill(mockDb, []);

    expect(result).toEqual({ count: 2, status: 'DRY_RUN' });
    expect(mockDb.location.updateMany).not.toHaveBeenCalled();
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('applies updates inside a transaction when --apply is passed', async () => {
    mockDb.location.findMany.mockResolvedValue([
      { id: 'loc-1', code: 'GI-1', name: 'GI One', locationType: 'GI', rtuppId: 'rtupp-other-uuid' },
      { id: 'loc-2', code: 'GI-2', name: 'GI Two', locationType: 'GI', rtuppId: null },
    ]);

    const result = await runBackfill(mockDb, ['--apply']);

    expect(result).toEqual({ count: 5, status: 'SUCCESS' });
    expect(mockDb.$transaction).toHaveBeenCalled();
  });

  it('returns NO_OP if all GI locations are already assigned to RTUPP1', async () => {
    mockDb.location.findMany.mockResolvedValue([
      { id: 'loc-1', code: 'GI-1', name: 'GI One', locationType: 'GI', rtuppId: 'rtupp-1-uuid' },
      { id: 'loc-2', code: 'GI-2', name: 'GI Two', locationType: 'GI', rtuppId: 'rtupp-1-uuid' },
    ]);

    const result = await runBackfill(mockDb, ['--apply']);

    expect(result).toEqual({ count: 0, status: 'NO_OP' });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});
