import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub out audit log writes so tests do not attempt real database connections.
vi.mock('../../utils/auditLog', () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../notifications/notification.dispatcher', () => ({
  notificationDispatcher: {
    taskAssignedTeam: vi.fn(),
    workOrderWorkflow: vi.fn(),
  },
}));

// Cascade targets — mock so approve/reject never touch the DB.
vi.mock('../laporan-gi/laporan-gi.repository', () => ({
  laporanGiRepository: { cascadeStatusByWorkOrder: vi.fn().mockResolvedValue({ count: 0 }) },
}));
vi.mock('../laporan-har-gi/laporan-har-gi.repository', () => ({
  laporanHarGiRepository: { cascadeStatusByWorkOrder: vi.fn().mockResolvedValue({ count: 0 }) },
}));
vi.mock('../laporan-inspeksi-gh/laporan-inspeksi-gh.repository', () => ({
  laporanInspeksiGhRepository: { cascadeStatusByWorkOrder: vi.fn().mockResolvedValue({ count: 0 }) },
}));
vi.mock('../laporan-har-gh/laporan-har-gh.repository', () => ({
  laporanHarGhRepository: { cascadeStatusByWorkOrder: vi.fn().mockResolvedValue({ count: 0 }) },
}));
vi.mock('../laporan-inspeksi-mp/laporan-inspeksi-mp.repository', () => ({
  laporanInspeksiMpRepository: { cascadeStatusByWorkOrder: vi.fn().mockResolvedValue({ count: 0 }) },
}));
vi.mock('../laporan-har-mp/laporan-har-mp.repository', () => ({
  laporanHarMpRepository: { cascadeStatusByWorkOrder: vi.fn().mockResolvedValue({ count: 0 }) },
}));

import { notificationDispatcher } from '../notifications/notification.dispatcher';
import { laporanGiRepository } from '../laporan-gi/laporan-gi.repository';
import { laporanHarGiRepository } from '../laporan-har-gi/laporan-har-gi.repository';
import { laporanInspeksiGhRepository } from '../laporan-inspeksi-gh/laporan-inspeksi-gh.repository';
import { laporanHarGhRepository } from '../laporan-har-gh/laporan-har-gh.repository';
import { laporanInspeksiMpRepository } from '../laporan-inspeksi-mp/laporan-inspeksi-mp.repository';
import { laporanHarMpRepository } from '../laporan-har-mp/laporan-har-mp.repository';
import { BusinessRuleError, ValidationError, ForbiddenError } from '../../utils/appError';
import type { TenantScope } from '../../utils/tenantScope';
import { WorkOrderService } from './work-order.service';

describe('WorkOrderService.create — validation of locations, bays, feeders, assets', () => {
  let mockRepo: any;
  const scope = { global: false, rtuppId: 'rtupp-1-uuid' } as any;
  const actor = { userId: 'user-1-uuid', role: 'ADMIN' };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      locationExists: vi.fn().mockResolvedValue({ id: 'gi-1', locationType: 'GI', rtuppId: 'rtupp-1-uuid' }),
      bayExists: vi.fn().mockImplementation(async (bayId, locId) => {
        return bayId === 'bay-1' && locId === 'gi-1';
      }),
      feederExists: vi.fn().mockImplementation(async (feederId, locId) => {
        return feederId === 'feeder-1' && locId === 'gi-1';
      }),
      assetExists: vi.fn().mockImplementation(async (assetId, locId) => {
        return assetId === 'asset-1' && locId === 'gi-1';
      }),
      findByNumber: vi.fn().mockResolvedValue(null),
      teamExists: vi.fn().mockResolvedValue(true),
      userTeamId: vi.fn().mockResolvedValue(null),
      teamMemberIds: vi.fn().mockResolvedValue([]),
      hasSubmittedGiReport: vi.fn().mockResolvedValue(true),
      hasSubmittedHarReport: vi.fn().mockResolvedValue(false),
      hasSubmittedInspeksiGhReport: vi.fn().mockResolvedValue(false),
      hasSubmittedHarGhReport: vi.fn().mockResolvedValue(false),
      hasSubmittedInspeksiMpReport: vi.fn().mockResolvedValue(false),
      hasSubmittedHarMpReport: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockImplementation(async (data) => ({ id: 'wo-1', ...data })),
      findById: vi.fn().mockResolvedValue({
        id: 'wo-1',
        locationId: 'gi-1',
        status: 'DRAFT',
        teamId: null,
      }),
      update: vi.fn().mockImplementation(async (id, data) => ({ id, ...data })),
      teamRtuppId: vi.fn().mockResolvedValue('rtupp-1-uuid'),
    };
  });

  it('successfully creates a work order with only GI (locationId) and feederId, with bayId/assetId being empty', async () => {
    const svc = new WorkOrderService(mockRepo);
    const input = {
      type: 'CORRECTIVE' as const,
      title: 'WO 1',
      locationId: 'gi-1',
      feederId: 'feeder-1',
      teamId: 'team-1',
      requiredReports: ['GI'] as ('GI' | 'HAR')[],
    };

    const result = await svc.create(input, actor, scope);
    expect(result.id).toBe('wo-1');
    expect(result.location.connect.id).toBe('gi-1');
    expect(result.feeder.connect.id).toBe('feeder-1');
    expect(result.bay).toBeUndefined();
    expect(result.asset).toBeUndefined();
    expect(result.requiredReports).toEqual(['GI']);
    expect(mockRepo.create).toHaveBeenCalled();
  });

  it('rejects creation when requiredReports is missing/empty (min 1 wajib)', async () => {
    const svc = new WorkOrderService(mockRepo);
    await expect(
      svc.create({ type: 'CORRECTIVE' as const, title: 'WO no-reports', locationId: 'gi-1' }, actor, scope),
    ).rejects.toThrowError(ValidationError);
    await expect(
      svc.create({ type: 'CORRECTIVE' as const, title: 'WO empty', locationId: 'gi-1', requiredReports: [] as ('GI' | 'HAR')[] }, actor, scope),
    ).rejects.toThrowError(ValidationError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  // ── OPSI A: WO untuk lokasi GH + kecocokan requiredReports↔tipe ──────────────
  it('creates WO for a GH location with requiredReports [INSPEKSI_GH]', async () => {
    mockRepo.locationExists.mockResolvedValue({ id: 'gh-1', locationType: 'GH', rtuppId: 'rtupp-1-uuid' });
    const svc = new WorkOrderService(mockRepo);
    const result = await svc.create(
      { type: 'PREVENTIVE' as const, title: 'WO GH', locationId: 'gh-1', requiredReports: ['INSPEKSI_GH'] as any },
      actor,
      scope,
    );
    expect(result.id).toBe('wo-1');
    expect(result.location.connect.id).toBe('gh-1');
    expect(result.requiredReports).toEqual(['INSPEKSI_GH']);
  });

  it('auto-generated woNumber uses WO-GH- prefix for GH locations (GI keeps WO-GI-)', async () => {
    mockRepo.locationExists.mockResolvedValue({ id: 'gh-1', locationType: 'GH', rtuppId: 'rtupp-1-uuid' });
    const svc = new WorkOrderService(mockRepo);
    const gh = await svc.create(
      { type: 'PREVENTIVE' as const, title: 'WO GH num', locationId: 'gh-1', requiredReports: ['INSPEKSI_GH'] as any },
      actor,
      scope,
    );
    expect(gh.woNumber).toMatch(/^WO-GH-/);

    mockRepo.locationExists.mockResolvedValue({ id: 'gi-1', locationType: 'GI', rtuppId: 'rtupp-1-uuid' });
    const gi = await svc.create(
      { type: 'CORRECTIVE' as const, title: 'WO GI num', locationId: 'gi-1', requiredReports: ['GI'] as any },
      actor,
      scope,
    );
    expect(gi.woNumber).toMatch(/^WO-GI-/);
  });

  it('creates WO for a GH location with both GH reports [INSPEKSI_GH, HAR_GH]', async () => {
    mockRepo.locationExists.mockResolvedValue({ id: 'gh-1', locationType: 'GH', rtuppId: 'rtupp-1-uuid' });
    const svc = new WorkOrderService(mockRepo);
    const result = await svc.create(
      { type: 'PREVENTIVE' as const, title: 'WO GH2', locationId: 'gh-1', requiredReports: ['INSPEKSI_GH', 'HAR_GH'] as any },
      actor,
      scope,
    );
    expect(result.requiredReports).toEqual(['INSPEKSI_GH', 'HAR_GH']);
  });

  it('rejects GH location with GI-type report (mismatch → 422)', async () => {
    mockRepo.locationExists.mockResolvedValue({ id: 'gh-1', locationType: 'GH', rtuppId: 'rtupp-1-uuid' });
    const svc = new WorkOrderService(mockRepo);
    await expect(
      svc.create({ type: 'PREVENTIVE' as const, title: 'WO bad', locationId: 'gh-1', requiredReports: ['GI'] as any }, actor, scope),
    ).rejects.toThrowError(ValidationError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('rejects GI location with GH-type report (mismatch → 422)', async () => {
    // base mock: locationType GI
    const svc = new WorkOrderService(mockRepo);
    await expect(
      svc.create({ type: 'PREVENTIVE' as const, title: 'WO bad2', locationId: 'gi-1', requiredReports: ['INSPEKSI_GH'] as any }, actor, scope),
    ).rejects.toThrowError(ValidationError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('rejects a non-GI/non-GH/non-GARDU location type', async () => {
    mockRepo.locationExists.mockResolvedValue({ id: 'x-1', locationType: 'UNKNOWN', rtuppId: 'rtupp-1-uuid' });
    const svc = new WorkOrderService(mockRepo);
    await expect(
      svc.create({ type: 'CORRECTIVE' as const, title: 'WO x', locationId: 'x-1', requiredReports: ['GI'] as any }, actor, scope),
    ).rejects.toThrowError(BusinessRuleError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('GARDU (distribution/MP) location is now valid but requires INSPEKSI_MP/HAR_MP, not GI', async () => {
    mockRepo.locationExists.mockResolvedValue({ id: 'g-1', locationType: 'GARDU', rtuppId: 'rtupp-1-uuid' });
    const svc = new WorkOrderService(mockRepo);
    await expect(
      svc.create({ type: 'CORRECTIVE' as const, title: 'WO gardu', locationId: 'g-1', requiredReports: ['GI'] as any }, actor, scope),
    ).rejects.toThrowError(ValidationError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('rejects cross-RTUPP: Admin RTUPP2 creating WO for a GH owned by RTUPP3 → 403', async () => {
    mockRepo.locationExists.mockResolvedValue({ id: 'gh-r3', locationType: 'GH', rtuppId: 'rtupp-3-uuid' });
    const svc = new WorkOrderService(mockRepo);
    const scopeR2 = { global: false, rtuppId: 'rtupp-2-uuid' } as any;
    await expect(
      svc.create({ type: 'PREVENTIVE' as const, title: 'WO xtenant', locationId: 'gh-r3', requiredReports: ['INSPEKSI_GH'] as any }, actor, scopeR2),
    ).rejects.toThrowError(ForbiddenError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('rejects creation if bayId belongs to another GI', async () => {
    const svc = new WorkOrderService(mockRepo);
    const input = {
      type: 'CORRECTIVE' as const,
      title: 'WO 2',
      locationId: 'gi-1',
      bayId: 'bay-other', // belongs to another GI, so bayExists returns false
    };

    await expect(svc.create(input, actor, scope)).rejects.toThrowError(ValidationError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('rejects creation if feederId belongs to another GI', async () => {
    const svc = new WorkOrderService(mockRepo);
    const input = {
      type: 'CORRECTIVE' as const,
      title: 'WO 3',
      locationId: 'gi-1',
      feederId: 'feeder-other',
    };

    await expect(svc.create(input, actor, scope)).rejects.toThrowError(ValidationError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('rejects creation if assetId belongs to another GI', async () => {
    const svc = new WorkOrderService(mockRepo);
    const input = {
      type: 'CORRECTIVE' as const,
      title: 'WO 4',
      locationId: 'gi-1',
      assetId: 'asset-other',
    };

    await expect(svc.create(input, actor, scope)).rejects.toThrowError(ValidationError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('successfully updates a work order when bayId/feederId/assetId are null or belong to the current GI', async () => {
    const svc = new WorkOrderService(mockRepo);
    const input = {
      title: 'Updated WO',
      bayId: 'bay-1',
      feederId: 'feeder-1',
      assetId: null,
    };

    const result = await svc.update('wo-1', input, actor, scope);
    expect(result.id).toBe('wo-1');
    expect(result.title).toBe('Updated WO');
    expect(result.bay?.connect?.id).toBe('bay-1');
    expect(result.feeder?.connect?.id).toBe('feeder-1');
    expect(mockRepo.update).toHaveBeenCalled();
  });

  it('rejects update if the updated bayId belongs to another GI', async () => {
    const svc = new WorkOrderService(mockRepo);
    const input = {
      bayId: 'bay-other',
    };

    await expect(svc.update('wo-1', input, actor, scope)).rejects.toThrowError(ValidationError);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('rejects update if the updated feederId belongs to another GI', async () => {
    const svc = new WorkOrderService(mockRepo);
    const input = {
      feederId: 'feeder-other',
    };

    await expect(svc.update('wo-1', input, actor, scope)).rejects.toThrowError(ValidationError);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('rejects update if the updated assetId belongs to another GI', async () => {
    const svc = new WorkOrderService(mockRepo);
    const input = {
      assetId: 'asset-other',
    };

    await expect(svc.update('wo-1', input, actor, scope)).rejects.toThrowError(ValidationError);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('allows update while WO is ASSIGNED (still pre-execution)', async () => {
    mockRepo.findById.mockResolvedValue({ id: 'wo-1', locationId: 'gi-1', status: 'ASSIGNED', teamId: null });
    const svc = new WorkOrderService(mockRepo);

    await expect(svc.update('wo-1', { title: 'Updated' }, actor, scope)).resolves.toBeTruthy();
    expect(mockRepo.update).toHaveBeenCalled();
  });

  it.each(['ON_PROGRESS', 'WAITING_APPROVAL', 'APPROVED', 'REJECTED', 'CLOSED'])(
    'rejects update once WO is %s (locked after work starts) → ForbiddenError',
    async (status) => {
      mockRepo.findById.mockResolvedValue({ id: 'wo-1', locationId: 'gi-1', status, teamId: null });
      const svc = new WorkOrderService(mockRepo);

      await expect(svc.update('wo-1', { title: 'Updated' }, actor, scope)).rejects.toThrowError(ForbiddenError);
      expect(mockRepo.update).not.toHaveBeenCalled();
    },
  );

  it('successfully saves work order result (saveResult) when assetId is valid or null', async () => {
    mockRepo.findById.mockResolvedValue({
      id: 'wo-1',
      locationId: 'gi-1',
      status: 'ON_PROGRESS',
      teamId: null,
    });
    const svc = new WorkOrderService(mockRepo);
    const input = {
      hasilRC: 'BERHASIL' as const,
      assetId: 'asset-1',
    };

    const result = await svc.saveResult('wo-1', input, actor, scope);
    expect(result.id).toBe('wo-1');
    expect(result.assetId).toBe('asset-1');
    expect(mockRepo.update).toHaveBeenCalled();
  });

  it('rejects saveResult if the assetId belongs to another GI', async () => {
    mockRepo.findById.mockResolvedValue({
      id: 'wo-1',
      locationId: 'gi-1',
      status: 'ON_PROGRESS',
      teamId: null,
    });
    const svc = new WorkOrderService(mockRepo);
    const input = {
      assetId: 'asset-other',
    };

    await expect(svc.saveResult('wo-1', input, actor, scope)).rejects.toThrowError(ValidationError);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('successfully submits work order result (submit) when assetId is valid or null', async () => {
    mockRepo.findById.mockResolvedValue({
      id: 'wo-1',
      locationId: 'gi-1',
      status: 'ON_PROGRESS',
      teamId: null,
    });
    // We mock transition for submit test since it calls transition()
    const svc = new WorkOrderService(mockRepo);
    const input = {
      hasilRC: 'BERHASIL' as const,
      assetId: 'asset-1',
    };

    // mock transition method since it uses assertTransition which would check current.status transitions
    const spyTransition = vi.spyOn(svc as any, 'transition').mockResolvedValue({ id: 'wo-1' });

    const result = await svc.submit('wo-1', input, actor, scope);
    expect(result.id).toBe('wo-1');
    expect(spyTransition).toHaveBeenCalledWith(
      'wo-1',
      'WAITING_APPROVAL',
      actor,
      scope,
      expect.objectContaining({ hasilRC: 'BERHASIL', assetId: 'asset-1' }),
      { requireAssignee: false }
    );
  });

  it('rejects submit if the assetId belongs to another GI', async () => {
    mockRepo.findById.mockResolvedValue({
      id: 'wo-1',
      locationId: 'gi-1',
      status: 'ON_PROGRESS',
      teamId: null,
    });
    const svc = new WorkOrderService(mockRepo);
    const input = {
      assetId: 'asset-other',
    };

    await expect(svc.submit('wo-1', input, actor, scope)).rejects.toThrowError(ValidationError);
  });

  it('triggers notification on submit', async () => {
    mockRepo.findById.mockResolvedValue({
      id: 'wo-1',
      locationId: 'gi-1',
      status: 'ON_PROGRESS',
      teamId: 'team-1',
    });
    const svc = new WorkOrderService(mockRepo);
    const spyTransition = vi.spyOn(svc as any, 'transition').mockResolvedValue({
      id: 'wo-1',
      woNumber: 'WO-123',
      location: { rtuppId: 'rtupp-1-uuid' },
      teamId: 'team-1',
    });

    await svc.submit('wo-1', { hasilRC: 'BERHASIL' }, actor, scope);
    expect(notificationDispatcher.workOrderWorkflow).toHaveBeenCalledWith({
      action: 'SUBMIT',
      workOrderId: 'wo-1',
      woNumber: 'WO-123',
      rtuppId: 'rtupp-1-uuid',
      actorId: actor.userId,
    });
  });

  it('triggers notification on approve', async () => {
    mockRepo.teamMemberIds.mockResolvedValue(['petugas-1-uuid']);
    const svc = new WorkOrderService(mockRepo);
    const spyTransition = vi.spyOn(svc as any, 'transition').mockResolvedValue({
      id: 'wo-1',
      woNumber: 'WO-123',
      location: { rtuppId: 'rtupp-1-uuid' },
      teamId: 'team-1',
    });

    await svc.approve('wo-1', actor, scope);
    expect(mockRepo.teamMemberIds).toHaveBeenCalledWith('team-1');
    expect(notificationDispatcher.workOrderWorkflow).toHaveBeenCalledWith({
      action: 'APPROVE',
      workOrderId: 'wo-1',
      woNumber: 'WO-123',
      rtuppId: 'rtupp-1-uuid',
      ownerIds: ['petugas-1-uuid'],
      actorId: actor.userId,
    });
  });

  it('triggers notification on reject', async () => {
    mockRepo.teamMemberIds.mockResolvedValue(['petugas-1-uuid']);
    const svc = new WorkOrderService(mockRepo);
    const spyTransition = vi.spyOn(svc as any, 'transition').mockResolvedValue({
      id: 'wo-1',
      woNumber: 'WO-123',
      location: { rtuppId: 'rtupp-1-uuid' },
      teamId: 'team-1',
    });

    await svc.reject('wo-1', { revisionNote: 'Perlu revisi data' }, actor, scope);
    expect(notificationDispatcher.workOrderWorkflow).toHaveBeenCalledWith({
      action: 'REJECT',
      workOrderId: 'wo-1',
      woNumber: 'WO-123',
      rtuppId: 'rtupp-1-uuid',
      ownerIds: ['petugas-1-uuid'],
      actorId: actor.userId,
      reason: 'Perlu revisi data',
    });
  });

  it('approve cascades VALIDATED to BOTH linked Laporan GI and HAR GI', async () => {
    const svc = new WorkOrderService(mockRepo);
    vi.spyOn(svc as any, 'transition').mockResolvedValue({ id: 'wo-1', woNumber: 'WO-1', location: {}, teamId: null });
    await svc.approve('wo-1', actor, scope);
    expect(laporanGiRepository.cascadeStatusByWorkOrder).toHaveBeenCalledWith('wo-1', 'VALIDATED', null, actor.userId);
    expect(laporanHarGiRepository.cascadeStatusByWorkOrder).toHaveBeenCalledWith('wo-1', 'VALIDATED', null, actor.userId);
  });

  it('reject cascades REJECTED + note to BOTH linked Laporan GI and HAR GI', async () => {
    const svc = new WorkOrderService(mockRepo);
    vi.spyOn(svc as any, 'transition').mockResolvedValue({ id: 'wo-1', woNumber: 'WO-1', location: {}, teamId: null });
    await svc.reject('wo-1', { revisionNote: 'perbaiki' }, actor, scope);
    expect(laporanGiRepository.cascadeStatusByWorkOrder).toHaveBeenCalledWith('wo-1', 'REJECTED', 'perbaiki', actor.userId);
    expect(laporanHarGiRepository.cascadeStatusByWorkOrder).toHaveBeenCalledWith('wo-1', 'REJECTED', 'perbaiki', actor.userId);
  });

  it('approve cascades VALIDATED to BOTH GH tables (Inspeksi GH + HAR GH)', async () => {
    const svc = new WorkOrderService(mockRepo);
    vi.spyOn(svc as any, 'transition').mockResolvedValue({ id: 'wo-1', woNumber: 'WO-1', location: {}, teamId: null });
    await svc.approve('wo-1', actor, scope);
    expect(laporanInspeksiGhRepository.cascadeStatusByWorkOrder).toHaveBeenCalledWith('wo-1', 'VALIDATED', null, actor.userId);
    expect(laporanHarGhRepository.cascadeStatusByWorkOrder).toHaveBeenCalledWith('wo-1', 'VALIDATED', null, actor.userId);
  });

  it('reject cascades REJECTED + note to BOTH GH tables (Inspeksi GH + HAR GH)', async () => {
    const svc = new WorkOrderService(mockRepo);
    vi.spyOn(svc as any, 'transition').mockResolvedValue({ id: 'wo-1', woNumber: 'WO-1', location: {}, teamId: null });
    await svc.reject('wo-1', { revisionNote: 'perbaiki GH' }, actor, scope);
    expect(laporanInspeksiGhRepository.cascadeStatusByWorkOrder).toHaveBeenCalledWith('wo-1', 'REJECTED', 'perbaiki GH', actor.userId);
    expect(laporanHarGhRepository.cascadeStatusByWorkOrder).toHaveBeenCalledWith('wo-1', 'REJECTED', 'perbaiki GH', actor.userId);
  });

  describe('onLinkedReportSubmitted — maps GI result + advance-if-complete', () => {
    const giResult = { hasilRC: 'BERHASIL', hasilLR: 'GAGAL', hasilES: 'BERHASIL', statusCB: 'NORMAL' } as any;

    it('GI result, legacy WO → writes hasil* + statusCB and moves ON_PROGRESS → WAITING_APPROVAL', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'wo-1', locationId: 'gi-1', status: 'ON_PROGRESS', teamId: null, startedAt: new Date(), woNumber: 'WO-1', location: { rtuppId: 'r1' } });
      const svc = new WorkOrderService(mockRepo);
      await svc.onLinkedReportSubmitted('wo-1', { resultMapping: giResult }, actor, scope);
      expect(mockRepo.update).toHaveBeenCalledWith(
        'wo-1',
        expect.objectContaining({ hasilRC: 'BERHASIL', hasilLR: 'GAGAL', hasilES: 'BERHASIL', statusCB: 'NORMAL', status: 'WAITING_APPROVAL' }),
      );
      expect(notificationDispatcher.workOrderWorkflow).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUBMIT', workOrderId: 'wo-1' }));
    });

    it('auto-advances ASSIGNED → ON_PROGRESS → WAITING_APPROVAL (legacy WO)', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'wo-1', locationId: 'gi-1', status: 'ASSIGNED', teamId: null, startedAt: null, woNumber: 'WO-1', location: {} });
      const svc = new WorkOrderService(mockRepo);
      await svc.onLinkedReportSubmitted('wo-1', { resultMapping: giResult }, actor, scope);
      expect(mockRepo.update).toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
    });

    it('rejects when WO already WAITING_APPROVAL/APPROVED/CLOSED', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'wo-1', locationId: 'gi-1', status: 'APPROVED', teamId: null });
      const svc = new WorkOrderService(mockRepo);
      await expect(svc.onLinkedReportSubmitted('wo-1', { resultMapping: giResult }, actor, scope)).rejects.toThrowError(BusinessRuleError);
    });
  });

  describe('assign() — cross-RTUPP team guard', () => {
    it('ADMIN RTUPP2 tidak bisa assign ke tim RTUPP lain → ForbiddenError', async () => {
      const scopeR2 = { global: false, rtuppId: 'rtupp-2-uuid' };
      mockRepo.findById.mockResolvedValue({
        id: 'wo-1',
        locationId: 'gi-1',
        status: 'DRAFT',
        teamId: null,
        location: { rtuppId: 'rtupp-2-uuid' },
      });
      mockRepo.teamExists.mockResolvedValue(true);
      mockRepo.teamRtuppId.mockResolvedValue('rtupp-3-uuid'); // tim dari RTUPP lain

      const svc = new WorkOrderService(mockRepo);
      await expect(
        svc.assign('wo-1', { teamId: 'team-rtupp3' }, actor, scopeR2),
      ).rejects.toThrowError(ForbiddenError);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('MASTER (global scope) bisa assign ke tim RTUPP manapun', async () => {
      const globalActor = { userId: 'master-1', role: 'MASTER' };
      const globalScope = { global: true, rtuppId: null };
      mockRepo.findById.mockResolvedValue({
        id: 'wo-1',
        locationId: 'gi-1',
        status: 'DRAFT',
        teamId: null,
        location: { rtuppId: 'rtupp-3-uuid' },
      });
      mockRepo.teamExists.mockResolvedValue(true);
      mockRepo.teamRtuppId.mockResolvedValue('rtupp-5-uuid');

      const svc = new WorkOrderService(mockRepo);
      await expect(
        svc.assign('wo-1', { teamId: 'team-rtupp5' }, globalActor, globalScope),
      ).resolves.toBeDefined();
      expect(mockRepo.update).toHaveBeenCalled();
    });
  });

  describe('assign() — cross-RTUPP team guard', () => {
    it('ADMIN RTUPP2 tidak bisa assign ke tim RTUPP lain → ForbiddenError', async () => {
      const scopeR2: TenantScope = { global: false, rtuppId: 'rtupp-2-uuid' };
      const adminR2 = { userId: 'admin-1', role: 'ADMIN' };
      mockRepo.findById.mockResolvedValue({
        id: 'wo-1', status: 'DRAFT', locationId: 'gi-1', teamId: null, location: { rtuppId: 'rtupp-2-uuid' },
      });
      mockRepo.teamExists.mockResolvedValue(true);
      mockRepo.teamRtuppId.mockResolvedValue('rtupp-3-uuid');
      const svc = new WorkOrderService(mockRepo);
      await expect(svc.assign('wo-1', { teamId: 'team-rtupp3' }, adminR2, scopeR2))
        .rejects.toThrowError(ForbiddenError);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('MASTER (global scope) bisa assign ke tim RTUPP manapun', async () => {
      const globalScope: TenantScope = { global: true, rtuppId: null };
      const master = { userId: 'master-1', role: 'MASTER' };
      mockRepo.findById.mockResolvedValue({
        id: 'wo-1', status: 'DRAFT', locationId: 'gi-1', teamId: null, location: { rtuppId: 'rtupp-3-uuid' },
      });
      mockRepo.teamExists.mockResolvedValue(true);
      mockRepo.teamRtuppId.mockResolvedValue('rtupp-5-uuid');
      mockRepo.teamMemberIds.mockResolvedValue([]);
      const svc = new WorkOrderService(mockRepo);
      await expect(svc.assign('wo-1', { teamId: 'team-rtupp5' }, master, globalScope))
        .resolves.toBeDefined();
      expect(mockRepo.update).toHaveBeenCalled();
    });
  });

  describe('REJECTED ("Tidak Sesuai") is terminal — no reopen', () => {
    beforeEach(() => {
      mockRepo.findById.mockResolvedValue({
        id: 'wo-1',
        locationId: 'gi-1',
        status: 'REJECTED',
        teamId: null,
        woNumber: 'WO-1',
        location: { rtuppId: 'r1' },
      });
    });

    it('assign() refuses to reassign a REJECTED WO', async () => {
      const svc = new WorkOrderService(mockRepo);
      await expect(svc.assign('wo-1', { teamId: 'team-1' }, actor, scope)).rejects.toThrowError(BusinessRuleError);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('start() refuses to start a REJECTED WO', async () => {
      const svc = new WorkOrderService(mockRepo);
      await expect(svc.start('wo-1', actor, scope)).rejects.toThrowError(BusinessRuleError);
    });

    it('close() refuses to close a REJECTED WO', async () => {
      const svc = new WorkOrderService(mockRepo);
      await expect(svc.close('wo-1', {}, actor, scope)).rejects.toThrowError(BusinessRuleError);
    });

    it('onLinkedReportSubmitted() refuses reports on a REJECTED WO', async () => {
      const svc = new WorkOrderService(mockRepo);
      await expect(svc.onLinkedReportSubmitted('wo-1', {}, actor, scope)).rejects.toThrowError(BusinessRuleError);
    });
  });

  describe('completion gate — advance-if-complete (no throw on incomplete)', () => {
    const giResult = { hasilRC: 'BERHASIL', hasilLR: 'BERHASIL', hasilES: 'BERHASIL', statusCB: 'NORMAL' } as any;
    const onProgress = (requiredReports: unknown) => ({
      id: 'wo-1', locationId: 'gi-1', status: 'ON_PROGRESS', teamId: null,
      startedAt: new Date(), woNumber: 'WO-1', location: { rtuppId: 'r1' }, requiredReports,
    });

    it('WO ["GI"]: submit GI → advances to WAITING_APPROVAL (zero regression)', async () => {
      mockRepo.findById.mockResolvedValue(onProgress(['GI']));
      mockRepo.hasSubmittedGiReport.mockResolvedValue(true);
      const svc = new WorkOrderService(mockRepo);
      await svc.onLinkedReportSubmitted('wo-1', { resultMapping: giResult }, actor, scope);
      expect(mockRepo.hasSubmittedGiReport).toHaveBeenCalledWith('wo-1');
      expect(mockRepo.update).toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
    });

    it('WO ["GI","HAR"]: submit GI → SUCCESS without error, WO stays ON_PROGRESS (NOT advanced)', async () => {
      mockRepo.findById.mockResolvedValue(onProgress(['GI', 'HAR']));
      mockRepo.hasSubmittedGiReport.mockResolvedValue(true);  // GI sudah submitted
      mockRepo.hasSubmittedHarReport.mockResolvedValue(false); // HAR belum
      const svc = new WorkOrderService(mockRepo);
      // tidak melempar:
      await expect(svc.onLinkedReportSubmitted('wo-1', { resultMapping: giResult }, actor, scope)).resolves.toBeDefined();
      // WO tidak maju: status tetap ON_PROGRESS, BUKAN WAITING_APPROVAL.
      expect(mockRepo.update).toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'ON_PROGRESS', hasilRC: 'BERHASIL' }));
      expect(mockRepo.update).not.toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
      // tidak ada notifikasi "diajukan approval".
      expect(notificationDispatcher.workOrderWorkflow).not.toHaveBeenCalled();
    });

    it('WO ["GI","HAR"]: then submit HAR (last required) → WO AUTO-advances to WAITING_APPROVAL', async () => {
      mockRepo.findById.mockResolvedValue(onProgress(['GI', 'HAR']));
      mockRepo.hasSubmittedGiReport.mockResolvedValue(true);
      mockRepo.hasSubmittedHarReport.mockResolvedValue(true); // HAR kini juga submitted
      const svc = new WorkOrderService(mockRepo);
      // HAR submit → tanpa resultMapping (tidak menyentuh hasilRC).
      await svc.onLinkedReportSubmitted('wo-1', {}, actor, scope);
      expect(mockRepo.update).toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
      expect(notificationDispatcher.workOrderWorkflow).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUBMIT', workOrderId: 'wo-1' }));
    });

    it('explicit: WO does NOT advance while a required report is still missing', async () => {
      mockRepo.findById.mockResolvedValue(onProgress(['GI', 'HAR']));
      mockRepo.hasSubmittedGiReport.mockResolvedValue(false);
      mockRepo.hasSubmittedHarReport.mockResolvedValue(false);
      const svc = new WorkOrderService(mockRepo);
      await svc.onLinkedReportSubmitted('wo-1', {}, actor, scope);
      expect(mockRepo.update).not.toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
    });

    it('legacy WO (requiredReports null) → advances, gate not triggered (zero regression)', async () => {
      mockRepo.findById.mockResolvedValue(onProgress(null));
      const svc = new WorkOrderService(mockRepo);
      await svc.onLinkedReportSubmitted('wo-1', { resultMapping: giResult }, actor, scope);
      expect(mockRepo.hasSubmittedGiReport).not.toHaveBeenCalled();
      expect(mockRepo.hasSubmittedHarReport).not.toHaveBeenCalled();
      expect(mockRepo.update).toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
    });

    it('submit() (non-GI result path) still enforces the gate as a safety net (throws)', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'wo-1', locationId: 'gi-1', status: 'ON_PROGRESS', teamId: null, requiredReports: ['GI'] });
      mockRepo.hasSubmittedGiReport.mockResolvedValue(false);
      const svc = new WorkOrderService(mockRepo);
      await expect(svc.submit('wo-1', { hasilRC: 'BERHASIL' }, actor, scope)).rejects.toThrowError(BusinessRuleError);
    });

    // ── GATE GH ─────────────────────────────────────────────────────────────
    const rcResult = { hasilRC: 'BERHASIL', hasilLR: null, hasilES: null, statusCB: null } as any;

    it('WO ["INSPEKSI_GH"]: submit Inspeksi GH → advances to WAITING_APPROVAL', async () => {
      mockRepo.findById.mockResolvedValue(onProgress(['INSPEKSI_GH']));
      mockRepo.hasSubmittedInspeksiGhReport.mockResolvedValue(true);
      const svc = new WorkOrderService(mockRepo);
      await svc.onLinkedReportSubmitted('wo-1', { resultMapping: rcResult }, actor, scope);
      expect(mockRepo.hasSubmittedInspeksiGhReport).toHaveBeenCalledWith('wo-1');
      expect(mockRepo.update).toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
    });

    it('WO ["INSPEKSI_GH"]: Inspeksi GH belum submit → WO tetap ON_PROGRESS (tidak maju)', async () => {
      mockRepo.findById.mockResolvedValue(onProgress(['INSPEKSI_GH']));
      mockRepo.hasSubmittedInspeksiGhReport.mockResolvedValue(false);
      const svc = new WorkOrderService(mockRepo);
      await svc.onLinkedReportSubmitted('wo-1', {}, actor, scope);
      expect(mockRepo.update).not.toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
      expect(notificationDispatcher.workOrderWorkflow).not.toHaveBeenCalled();
    });

    it('WO ["INSPEKSI_GH","HAR_GH"]: baru Inspeksi GH → SUKSES tapi WO TETAP ON_PROGRESS', async () => {
      mockRepo.findById.mockResolvedValue(onProgress(['INSPEKSI_GH', 'HAR_GH']));
      mockRepo.hasSubmittedInspeksiGhReport.mockResolvedValue(true);
      mockRepo.hasSubmittedHarGhReport.mockResolvedValue(false);
      const svc = new WorkOrderService(mockRepo);
      await expect(svc.onLinkedReportSubmitted('wo-1', { resultMapping: rcResult }, actor, scope)).resolves.toBeDefined();
      expect(mockRepo.update).toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'ON_PROGRESS' }));
      expect(mockRepo.update).not.toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
      expect(notificationDispatcher.workOrderWorkflow).not.toHaveBeenCalled();
    });

    it('WO ["INSPEKSI_GH","HAR_GH"]: lalu submit HAR GH (terakhir) → WO AUTO-maju WAITING_APPROVAL', async () => {
      mockRepo.findById.mockResolvedValue(onProgress(['INSPEKSI_GH', 'HAR_GH']));
      mockRepo.hasSubmittedInspeksiGhReport.mockResolvedValue(true);
      mockRepo.hasSubmittedHarGhReport.mockResolvedValue(true);
      const svc = new WorkOrderService(mockRepo);
      // HAR GH submit → tanpa resultMapping.
      await svc.onLinkedReportSubmitted('wo-1', {}, actor, scope);
      expect(mockRepo.update).toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
      expect(notificationDispatcher.workOrderWorkflow).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUBMIT', workOrderId: 'wo-1' }));
    });

    // ── GATE MP (GARDU / Metering Point) ──────────────────────────────────────
    it('WO ["INSPEKSI_MP"]: submit Inspeksi MP → advances to WAITING_APPROVAL', async () => {
      mockRepo.findById.mockResolvedValue(onProgress(['INSPEKSI_MP']));
      mockRepo.hasSubmittedInspeksiMpReport.mockResolvedValue(true);
      const svc = new WorkOrderService(mockRepo);
      await svc.onLinkedReportSubmitted('wo-1', {}, actor, scope);
      expect(mockRepo.update).toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
    });

    it('WO ["INSPEKSI_MP"]: Inspeksi MP belum submit → WO tetap ON_PROGRESS', async () => {
      mockRepo.findById.mockResolvedValue(onProgress(['INSPEKSI_MP']));
      mockRepo.hasSubmittedInspeksiMpReport.mockResolvedValue(false);
      const svc = new WorkOrderService(mockRepo);
      await svc.onLinkedReportSubmitted('wo-1', {}, actor, scope);
      expect(mockRepo.update).not.toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
    });

    it('WO ["INSPEKSI_MP","HAR_MP"]: baru Inspeksi MP → WO TETAP ON_PROGRESS', async () => {
      mockRepo.findById.mockResolvedValue(onProgress(['INSPEKSI_MP', 'HAR_MP']));
      mockRepo.hasSubmittedInspeksiMpReport.mockResolvedValue(true);
      mockRepo.hasSubmittedHarMpReport.mockResolvedValue(false);
      const svc = new WorkOrderService(mockRepo);
      await expect(svc.onLinkedReportSubmitted('wo-1', {}, actor, scope)).resolves.toBeDefined();
      expect(mockRepo.update).not.toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
    });

    it('WO ["INSPEKSI_MP","HAR_MP"]: lalu submit HAR MP (terakhir) → WO AUTO-maju WAITING_APPROVAL', async () => {
      mockRepo.findById.mockResolvedValue(onProgress(['INSPEKSI_MP', 'HAR_MP']));
      mockRepo.hasSubmittedInspeksiMpReport.mockResolvedValue(true);
      mockRepo.hasSubmittedHarMpReport.mockResolvedValue(true);
      const svc = new WorkOrderService(mockRepo);
      await svc.onLinkedReportSubmitted('wo-1', {}, actor, scope);
      expect(mockRepo.update).toHaveBeenCalledWith('wo-1', expect.objectContaining({ status: 'WAITING_APPROVAL' }));
    });
  });
});
