import { describe, it, expect, vi } from 'vitest';

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

import { assertLaporanAwalSubmitted } from '../work-orders/work-order-report-gates';
import { assertWoNotRejected } from '../work-orders/work-order-lock.helper';
import { BusinessRuleError, ForbiddenError, ValidationError } from '../../utils/appError';
import { LaporanHarMpService } from './laporan-har-mp.service';
import { createLaporanHarMpSchema } from './laporan-har-mp.validation';

const scope = { global: false, rtuppId: 'rtupp-3' } as any;
const petugas = { userId: 'petugas-1', role: 'PETUGAS' };
const ok = (extra: Record<string, unknown> = {}) => ({ kesimpulan: 'BAIK', ...extra });
const kubOk = (over: Record<string, unknown> = {}) => ({
  namaGardu: 'GD KOTA',
  statusCubicle: 'CLOSE',
  statusRc: 'SIAP RC',
  ...over,
});

const completeReport = (over: Record<string, unknown> = {}) => ({
  id: 'har-mp-1',
  locationId: 'loc-1',
  workOrderId: 'wo-1',
  inspectorId: 'petugas-1',
  status: 'DRAFT',
  statusRc: 'SIAP RC',
  location: { code: 'GD0004', rtuppId: 'rtupp-3' },
  supplyTr: ok(),
  rectifier: ok(),
  baterai: ok(),
  rtu: ok(),
  media1: ok(),
  media2: { tidakAda: true },
  kubikel: [kubOk()],
  fdiRelay: { tidakAda: true },
  aco: { tidakAda: true },
  penanganan: ok(),
  ...over,
});

function makeRepo(over: Record<string, any> = {}) {
  return {
    workOrderById: vi.fn().mockResolvedValue({
      id: 'wo-1',
      locationId: 'loc-1',
      location: { up3: 'UP3 X', rtuppId: 'rtupp-3', locationType: 'GARDU', supplyFeederId: null },
      team: { name: 'PT ARHADI' },
    }),
    findById: vi.fn(),
    create: vi.fn().mockImplementation(async (data: any) => ({ id: 'har-mp-1', ...data })),
    update: vi.fn().mockImplementation(async (id: string, data: any) => ({
      id,
      location: { code: 'GD0004', rtuppId: 'rtupp-3' },
      inspectorId: 'petugas-1',
      workOrderId: 'wo-1',
      ...data,
    })),
    ...over,
  };
}

const svc = (repo: any) => new LaporanHarMpService(repo as any);

describe('HAR MP — workOrderId WAJIB + identitas dari WO', () => {
  it('schema menolak create tanpa workOrderId', () => {
    expect(createLaporanHarMpSchema.safeParse({ reportDate: '2024-11-05' }).success).toBe(false);
  });
  it('menyimpan kubikel array + identitas WO', async () => {
    const repo = makeRepo();
    await svc(repo).create(
      { workOrderId: 'wo-1', reportDate: new Date('2024-11-05'), kubikel: [kubOk()] } as any,
      petugas,
      scope,
    );
    const arg = repo.create.mock.calls[0][0];
    expect(arg.locationId).toBe('loc-1');
    expect(arg.pelaksana).toBe('PT ARHADI');
    expect(Array.isArray(arg.kubikel)).toBe(true);
    expect(arg.statusRc).toBe('SIAP RC');
  });
  it('gerbang Laporan Awal: create() diperiksa dengan WO id + requiredReports', async () => {
    const repo = makeRepo();
    await svc(repo).create(
      { workOrderId: 'wo-1', reportDate: new Date('2024-11-05'), kubikel: [kubOk()] } as any,
      petugas,
      scope,
    );
    expect(assertLaporanAwalSubmitted).toHaveBeenCalledWith('wo-1', undefined);
  });

  it('gerbang Laporan Awal: create() ditolak (422) bila belum ada Laporan Awal ter-submit', async () => {
    (assertLaporanAwalSubmitted as any).mockRejectedValueOnce(new BusinessRuleError('Isi Laporan Awal terlebih dahulu'));
    const repo = makeRepo();
    await expect(
      svc(repo).create({ workOrderId: 'wo-1', reportDate: new Date('2024-11-05'), kubikel: [kubOk()] } as any, petugas, scope),
    ).rejects.toThrowError(BusinessRuleError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('WO di luar RTUPP → 403', async () => {
    const repo = makeRepo({
      workOrderById: vi.fn().mockResolvedValue({
        id: 'wo-9',
        locationId: 'loc-9',
        location: { up3: 'Y', rtuppId: 'rtupp-9', locationType: 'GARDU', supplyFeederId: null },
        team: { name: 'Z' },
      }),
    });
    await expect(
      svc(repo).create({ workOrderId: 'wo-9', reportDate: new Date('2024-11-05') } as any, petugas, scope),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('menolak WO berlokasi non-GARDU', async () => {
    const repo = makeRepo({
      workOrderById: vi.fn().mockResolvedValue({
        id: 'wo-2',
        locationId: 'loc-2',
        location: { up3: 'UP3 X', rtuppId: 'rtupp-3', locationType: 'GI', supplyFeederId: null },
        team: { name: 'PT X' },
      }),
    });
    await expect(
      svc(repo).create({ workOrderId: 'wo-2', reportDate: new Date('2024-11-05') } as any, petugas, scope),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('HAR MP — submit array-aware kubikel', () => {
  it('menolak kubikel kosong', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(completeReport({ kubikel: [] })) });
    await expect(svc(repo).submit('har-mp-1', petugas, scope)).rejects.toBeInstanceOf(ValidationError);
  });
  it('menerima bila entri lengkap', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(completeReport()) });
    const res = await svc(repo).submit('har-mp-1', petugas, scope);
    expect(res.status).toBe('SUBMITTED');
  });

  it('menolak submit bila WO tertaut berstatus REJECTED ("Tidak Sesuai")', async () => {
    (assertWoNotRejected as any).mockImplementationOnce(() => {
      throw new BusinessRuleError('Work Order ini berstatus Tidak Sesuai — laporan tidak dapat diubah');
    });
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(completeReport({ workOrder: { id: 'wo-1', status: 'REJECTED' } })),
    });
    await expect(svc(repo).submit('har-mp-1', petugas, scope)).rejects.toThrowError(BusinessRuleError);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
