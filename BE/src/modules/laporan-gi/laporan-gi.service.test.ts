import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub audit-log writes (no DB) and the notification dispatcher.
vi.mock('../../utils/auditLog', () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../notifications/notification.dispatcher', () => ({
  notificationDispatcher: { giReportWorkflow: vi.fn() },
}));
vi.mock('../work-orders/work-order.service', () => ({
  workOrderService: { onLinkedReportSubmitted: vi.fn().mockResolvedValue({ id: 'wo-1' }) },
}));
vi.mock('../work-orders/work-order-report-gates', () => ({
  assertLaporanAwalSubmitted: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../work-orders/work-order-lock.helper', () => ({
  assertWoNotRejected: vi.fn(),
}));

import { notificationDispatcher } from '../notifications/notification.dispatcher';
import { workOrderService } from '../work-orders/work-order.service';
import { assertLaporanAwalSubmitted } from '../work-orders/work-order-report-gates';
import { assertWoNotRejected } from '../work-orders/work-order-lock.helper';
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/appError';
import { LaporanGiService } from './laporan-gi.service';
import { createLaporanGiSchema } from './laporan-gi.validation';

describe('createLaporanGiSchema — reportDate tidak boleh masa depan', () => {
  it('menerima tanggal hari ini / lampau', () => {
    expect(createLaporanGiSchema.safeParse({ locationId: 'loc-1', reportDate: new Date() }).success).toBe(true);
    expect(createLaporanGiSchema.safeParse({ locationId: 'loc-1', reportDate: '2024-11-05' }).success).toBe(true);
  });
  it('menolak tanggal masa depan', () => {
    const future = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    expect(createLaporanGiSchema.safeParse({ locationId: 'loc-1', reportDate: future }).success).toBe(false);
  });
});

const scope = { global: false, rtuppId: 'rtupp-1' } as any;
const petugas = { userId: 'petugas-1', role: 'PETUGAS' };
const admin = { userId: 'admin-1', role: 'ADMIN' };

/** Minimal complete section payload (kesimpulan present). */
const ok = (extra: Record<string, unknown> = {}) => ({ kesimpulan: 'BAIK', ...extra });

/** A fully-submittable persisted report (all active sections have kesimpulan). */
const completeReport = (over: Record<string, unknown> = {}) => ({
  id: 'gi-1',
  locationId: 'loc-1',
  inspectorId: 'petugas-1',
  status: 'DRAFT',
  location: { code: 'GI-PLP', rtuppId: 'rtupp-1' },
  rectifier: ok(),
  rectifierBackup: ok(),
  baterai: ok(),
  serialDevice: { utama: ok(), device2TidakAda: true },
  rtuIo: ok(),
  kubikel: ok({
    elements: {
      PMT: { relayOpen: 'ON', relayClose: 'OFF', cubicle: 'CLOSE', master: 'SESUAI', hasilRc: 'BERHASIL' }
    }
  }),
  relayProteksi: ok(),
  ...over,
});

function makeRepo(over: Record<string, any> = {}) {
  return {
    locationById: vi.fn().mockResolvedValue({ id: 'loc-1', locationType: 'GI', up3: 'UP3 X', rtuppId: 'rtupp-1' }),
    feederExists: vi.fn().mockResolvedValue(true),
    workOrderById: vi.fn(),
    findById: vi.fn(),
    create: vi.fn().mockImplementation(async (data) => ({ id: 'gi-1', ...data })),
    update: vi.fn().mockImplementation(async (id, data) => ({ id, location: { code: 'GI-PLP', rtuppId: 'rtupp-1' }, inspectorId: 'petugas-1', ...data })),
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('LaporanGiService.create', () => {
  it('creates a DRAFT, server-derives up3 from location, sets inspector = actor', async () => {
    const repo = makeRepo();
    const svc = new LaporanGiService(repo as any);
    const res = await svc.create(
      { locationId: 'loc-1', reportDate: new Date('2026-06-26'), up3: 'HACK', rectifier: ok() } as any,
      petugas,
      scope,
    );
    expect(repo.create).toHaveBeenCalled();
    const data = repo.create.mock.calls[0][0];
    expect(data.up3).toBe('UP3 X'); // authoritative, FE "HACK" ignored
    expect(data.inspectorId).toBe('petugas-1');
    expect(data.status).toBe('DRAFT');
    expect(res.id).toBe('gi-1');
  });

  it('rejects cross-RTUPP location with 403 (ForbiddenError)', async () => {
    const repo = makeRepo({
      locationById: vi.fn().mockResolvedValue({ id: 'loc-9', locationType: 'GI', up3: null, rtuppId: 'rtupp-OTHER' }),
    });
    const svc = new LaporanGiService(repo as any);
    await expect(
      svc.create({ locationId: 'loc-9', reportDate: new Date() } as any, petugas, scope),
    ).rejects.toThrowError(ForbiddenError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects non-GI location', async () => {
    const repo = makeRepo({
      locationById: vi.fn().mockResolvedValue({ id: 'loc-1', locationType: 'GH', up3: null, rtuppId: 'rtupp-1' }),
    });
    const svc = new LaporanGiService(repo as any);
    await expect(
      svc.create({ locationId: 'loc-1', reportDate: new Date() } as any, petugas, scope),
    ).rejects.toThrowError(BusinessRuleError);
  });

  it('auto-fills identity from Work Order and ignores FE-sent locationId', async () => {
    const repo = makeRepo({
      workOrderById: vi.fn().mockResolvedValue({
        id: 'wo-1', locationId: 'loc-1', feederId: 'feeder-1',
        location: { up3: 'UP3 X', rtuppId: 'rtupp-1', locationType: 'GI' },
        team: { name: 'PT VENDOR' },
      }),
    });
    const svc = new LaporanGiService(repo as any);
    await svc.create(
      { locationId: 'loc-EVIL', workOrderId: 'wo-1', reportDate: new Date() } as any,
      petugas,
      scope,
    );
    const data = repo.create.mock.calls[0][0];
    expect(data.locationId).toBe('loc-1'); // from WO, not loc-EVIL
    expect(data.feederId).toBe('feeder-1');
    expect(data.pelaksana).toBe('PT VENDOR');
    expect(repo.workOrderById).toHaveBeenCalledWith('wo-1', scope);
  });

  it('gerbang Laporan Awal skipped for standalone create (no workOrderId)', async () => {
    const repo = makeRepo();
    const svc = new LaporanGiService(repo as any);
    await svc.create({ locationId: 'loc-1', reportDate: new Date() } as any, petugas, scope);
    expect(assertLaporanAwalSubmitted).not.toHaveBeenCalled();
  });

  it('gerbang Laporan Awal checked when WO-linked create with requiredReports', async () => {
    const repo = makeRepo({
      workOrderById: vi.fn().mockResolvedValue({
        id: 'wo-1', locationId: 'loc-1', feederId: 'feeder-1', requiredReports: ['GI'],
        location: { up3: 'UP3 X', rtuppId: 'rtupp-1', locationType: 'GI' },
        team: { name: 'PT VENDOR' },
      }),
    });
    const svc = new LaporanGiService(repo as any);
    await svc.create({ workOrderId: 'wo-1', reportDate: new Date() } as any, petugas, scope);
    expect(assertLaporanAwalSubmitted).toHaveBeenCalledWith('wo-1', ['GI']);
  });

  it('gerbang Laporan Awal rejects (422) create when no Laporan Awal submitted yet', async () => {
    (assertLaporanAwalSubmitted as any).mockRejectedValueOnce(new BusinessRuleError('Isi Laporan Awal terlebih dahulu'));
    const repo = makeRepo({
      workOrderById: vi.fn().mockResolvedValue({
        id: 'wo-1', locationId: 'loc-1', feederId: 'feeder-1', requiredReports: ['GI'],
        location: { up3: 'UP3 X', rtuppId: 'rtupp-1', locationType: 'GI' },
        team: { name: 'PT VENDOR' },
      }),
    });
    const svc = new LaporanGiService(repo as any);
    await expect(
      svc.create({ workOrderId: 'wo-1', reportDate: new Date() } as any, petugas, scope),
    ).rejects.toThrowError(BusinessRuleError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('syncs kubikel.elements to database scalar fields upon creation', async () => {
    const repo = makeRepo();
    const svc = new LaporanGiService(repo as any);
    await svc.create(
      {
        locationId: 'loc-1',
        reportDate: new Date('2026-06-26'),
        kubikel: {
          elements: {
            PMT: { cubicle: 'CLOSE', master: 'SESUAI' },
            LR: { cubicle: 'REMOTE', master: 'TIDAK SESUAI' },
            ES: { master: 'SESUAI' },
            MPUF: { master: 'TIMBUL' }
          }
        }
      } as any,
      petugas,
      scope,
    );
    expect(repo.create).toHaveBeenCalled();
    const data = repo.create.mock.calls[0][0];
    expect(data.statusPmt).toBe('CLOSE');
    expect(data.statusPmtDiMaster).toBe('SESUAI');
    expect(data.statusLr).toBe('REMOTE');
    expect(data.statusLrDiMaster).toBe('TIDAK SESUAI');
    expect(data.esDiMaster).toBe('SESUAI');
    expect(data.mpufDiMaster).toBe('TIMBUL');
  });
});

describe('LaporanGiService.update', () => {
  it('blocks update when the linked WO is REJECTED ("Tidak Sesuai")', async () => {
    (assertWoNotRejected as any).mockImplementationOnce(() => {
      throw new BusinessRuleError('Work Order ini berstatus Tidak Sesuai — laporan tidak dapat diubah');
    });
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(completeReport({ workOrder: { id: 'wo-1', status: 'REJECTED' } })),
    });
    const svc = new LaporanGiService(repo as any);
    await expect(svc.update('gi-1', {} as any, petugas, scope)).rejects.toThrowError(BusinessRuleError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('syncs kubikel.elements to database scalar fields upon update', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(completeReport({ status: 'DRAFT' })),
    });
    const svc = new LaporanGiService(repo as any);
    await svc.update(
      'gi-1',
      {
        kubikel: {
          elements: {
            PMT: { cubicle: 'OPEN', master: 'TIDAK SESUAI' },
            LR: { cubicle: 'LOCAL', master: 'SESUAI' },
            ES: { master: 'TIDAK SESUAI' },
            MPUF: { master: 'TIDAK TIMBUL' }
          }
        }
      } as any,
      petugas,
      scope,
    );
    expect(repo.update).toHaveBeenCalled();
    const data = repo.update.mock.calls[0][1];
    expect(data.statusPmt).toBe('OPEN');
    expect(data.statusPmtDiMaster).toBe('TIDAK SESUAI');
    expect(data.statusLr).toBe('LOCAL');
    expect(data.statusLrDiMaster).toBe('SESUAI');
    expect(data.esDiMaster).toBe('TIDAK SESUAI');
    expect(data.mpufDiMaster).toBe('TIDAK TIMBUL');
  });
});

describe('LaporanGiService.submit — required kesimpulan + skip "tidak ada"', () => {
  it('rejects submit when an active section is missing kesimpulan', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(completeReport({ baterai: { merk: 'X' } /* no kesimpulan */ })),
    });
    const svc = new LaporanGiService(repo as any);
    await expect(svc.submit('gi-1', petugas, scope)).rejects.toThrowError(ValidationError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('skips an absent section (rectifierBackup tidakAda) and an absent sub-device (device2TidakAda)', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(
        completeReport({
          rectifierBackup: { tidakAda: true }, // absent → not required
          relayProteksi: { tidakAda: true },
          serialDevice: { utama: ok(), device2TidakAda: true }, // device2 skipped
        }),
      ),
    });
    const svc = new LaporanGiService(repo as any);
    const res = await svc.submit('gi-1', petugas, scope);
    expect(res.status).toBe('SUBMITTED');
    expect(repo.update).toHaveBeenCalledWith('gi-1', expect.objectContaining({ status: 'SUBMITTED' }));
    expect(notificationDispatcher.giReportWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SUBMIT', rtuppId: 'rtupp-1', ownerId: 'petugas-1' }),
    );
  });

  it('WO-linked submit maps manual RC/LR/ES/CB to the WO and skips standalone notif', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(
        completeReport({
          workOrderId: 'wo-1',
          kubikel: { kesimpulan: 'BAIK', elements: { PMT: { hasilRc: 'BERHASIL' } } },
        }),
      ),
    });
    const svc = new LaporanGiService(repo as any);
    const res = await svc.submit('gi-1', petugas, scope);
    expect(res.status).toBe('SUBMITTED');
    expect(workOrderService.onLinkedReportSubmitted).toHaveBeenCalledWith(
      'wo-1',
      { resultMapping: { hasilRC: 'BERHASIL', hasilLR: null, hasilES: null, statusCB: null } },
      petugas,
      scope,
    );
    expect(notificationDispatcher.giReportWorkflow).not.toHaveBeenCalled();
  });

  it('empty manual results map to null (dashboard skip)', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(completeReport({ workOrderId: 'wo-1', kubikel: { kesimpulan: 'BAIK', elements: {} } })),
    });
    const svc = new LaporanGiService(repo as any);
    await svc.submit('gi-1', petugas, scope);
    expect(workOrderService.onLinkedReportSubmitted).toHaveBeenCalledWith(
      'wo-1',
      { resultMapping: { hasilRC: null, hasilLR: null, hasilES: null, statusCB: null } },
      petugas,
      scope,
    );
  });
});

describe('LaporanGiService.decide — admin approval', () => {
  it('VALIDATED transitions and notifies the inspector (APPROVE)', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(completeReport({ status: 'SUBMITTED' })),
    });
    const svc = new LaporanGiService(repo as any);
    const res = await svc.decide('gi-1', { decision: 'VALIDATED' } as any, admin, scope);
    expect(res.status).toBe('VALIDATED');
    expect(notificationDispatcher.giReportWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPROVE', ownerId: 'petugas-1' }),
    );
  });

  it('REJECTED transitions with note and notifies the inspector (REJECT)', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(completeReport({ status: 'SUBMITTED' })),
    });
    const svc = new LaporanGiService(repo as any);
    const res = await svc.decide('gi-1', { decision: 'REJECTED', validationNote: 'Perbaiki' } as any, admin, scope);
    expect(res.status).toBe('REJECTED');
    expect(res.validationNote).toBe('Perbaiki');
    expect(notificationDispatcher.giReportWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REJECT', reason: 'Perbaiki' }),
    );
  });

  it('rejects decide when report is not SUBMITTED', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(completeReport({ status: 'DRAFT' })),
    });
    const svc = new LaporanGiService(repo as any);
    await expect(svc.decide('gi-1', { decision: 'VALIDATED' } as any, admin, scope)).rejects.toThrowError(BusinessRuleError);
  });

  it('blocks decide for a WO-linked report (approval via Work Order, satu jalur)', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(completeReport({ status: 'SUBMITTED', workOrderId: 'wo-1' })),
    });
    const svc = new LaporanGiService(repo as any);
    await expect(svc.decide('gi-1', { decision: 'VALIDATED' } as any, admin, scope)).rejects.toThrowError(BusinessRuleError);
  });
});

describe('LaporanGiService.getById — PETUGAS own-records guard', () => {
  it('forbids a PETUGAS from reading another inspector\'s report', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(completeReport({ inspectorId: 'other-petugas' })),
    });
    const svc = new LaporanGiService(repo as any);
    await expect(svc.getById('gi-1', petugas, scope)).rejects.toThrowError(ForbiddenError);
  });

  it('returns NotFound when scoped lookup yields nothing (cross-RTUPP fail-closed)', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const svc = new LaporanGiService(repo as any);
    await expect(svc.getById('gi-x', admin, scope)).rejects.toThrowError(NotFoundError);
  });
});
