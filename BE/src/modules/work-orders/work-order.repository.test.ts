import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database');

import prisma, { resetPrismaMock } from '../../config/database';
import { WorkOrderRepository } from './work-order.repository';

const anyPrisma = prisma as any;

describe('WorkOrderRepository.findAll — WO Saya (petugas) query, GI & GH agnostik', () => {
  const repo = new WorkOrderRepository();
  const baseQuery = { page: 1, limit: 20 } as any;

  beforeEach(() => {
    resetPrismaMock();
    anyPrisma.workOrder.findMany.mockResolvedValue([]);
    anyPrisma.workOrder.count.mockResolvedValue(0);
  });

  it('findAll TIDAK memfilter berdasarkan locationType — WO GH & GI sama-sama lolos (bug fix)', async () => {
    const scope = { global: false, rtuppId: 'rtupp-2-uuid' } as any;
    await repo.findAll(baseQuery, scope, { restrictToTeamId: 'team-gh-1' });

    const where = anyPrisma.workOrder.findMany.mock.calls[0][0].where;
    // Bug lama yang mungkin dicurigai: filter tipe lokasi di where.location.locationType.
    expect(where.location?.locationType).toBeUndefined();
    expect(JSON.stringify(where)).not.toContain('locationType');
  });

  it('restrictToTeamId (petugas) filter teamId — WO ditugaskan ke tim, bukan individu', async () => {
    const scope = { global: false, rtuppId: 'rtupp-2-uuid' } as any;
    await repo.findAll(baseQuery, scope, { restrictToTeamId: 'team-gh-1' });

    const where = anyPrisma.workOrder.findMany.mock.calls[0][0].where;
    expect(where.teamId).toBe('team-gh-1');
  });

  it('scope RTUPP tetap ditegakkan (isolasi) — petugas RTUPP2 tak melihat WO RTUPP3', async () => {
    const scope = { global: false, rtuppId: 'rtupp-2-uuid' } as any;
    await repo.findAll(baseQuery, scope, { restrictToTeamId: 'team-gh-1' });
    const where = anyPrisma.workOrder.findMany.mock.calls[0][0].where;
    expect(where.location).toEqual({ rtuppId: 'rtupp-2-uuid' });
  });

  it('petugas GI (RTUPP1) memakai jalur query yang sama persis — regresi nol', async () => {
    const scope = { global: false, rtuppId: 'rtupp-1-uuid' } as any;
    await repo.findAll(baseQuery, scope, { restrictToTeamId: 'team-gi-1' });
    const where = anyPrisma.workOrder.findMany.mock.calls[0][0].where;
    expect(where.location).toEqual({ rtuppId: 'rtupp-1-uuid' });
    expect(where.teamId).toBe('team-gi-1');
    expect(JSON.stringify(where)).not.toContain('locationType');
  });
});

describe('WorkOrderRepository — hasSubmitted* methods', () => {
  const repo = new WorkOrderRepository();

  beforeEach(() => {
    resetPrismaMock();
  });

  it('hasSubmittedInspeksiMpReport returns true when ≥1 SUBMITTED/VALIDATED row exists', async () => {
    anyPrisma.laporanInspeksiMp.count.mockResolvedValue(1);
    const result = await repo.hasSubmittedInspeksiMpReport('wo-1');
    expect(result).toBe(true);
    expect(anyPrisma.laporanInspeksiMp.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workOrderId: 'wo-1' }) }),
    );
  });

  it('hasSubmittedInspeksiMpReport returns false when count is 0', async () => {
    anyPrisma.laporanInspeksiMp.count.mockResolvedValue(0);
    const result = await repo.hasSubmittedInspeksiMpReport('wo-1');
    expect(result).toBe(false);
  });

  it('hasSubmittedHarMpReport returns true when ≥1 SUBMITTED/VALIDATED row exists', async () => {
    anyPrisma.laporanHarMp.count.mockResolvedValue(1);
    const result = await repo.hasSubmittedHarMpReport('wo-1');
    expect(result).toBe(true);
  });

  it('hasSubmittedHarMpReport returns false when count is 0', async () => {
    anyPrisma.laporanHarMp.count.mockResolvedValue(0);
    const result = await repo.hasSubmittedHarMpReport('wo-1');
    expect(result).toBe(false);
  });
});
