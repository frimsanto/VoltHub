import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub audit-log writes (no DB) and the WO service (service→service one-way).
vi.mock('../../utils/auditLog', () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
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

import { workOrderService } from '../work-orders/work-order.service';
import { assertLaporanAwalSubmitted } from '../work-orders/work-order-report-gates';
import { assertWoNotRejected } from '../work-orders/work-order-lock.helper';
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/appError';
import { LaporanHarGiService } from './laporan-har-gi.service';
import { createLaporanHarGiSchema } from './laporan-har-gi.validation';

const scope = { global: false, rtuppId: 'rtupp-1' } as any;
const petugas = { userId: 'petugas-1', role: 'PETUGAS' };

/** WO lookup result (tenant-scoped) used for identity auto-fill. */
const woRow = (over: Record<string, unknown> = {}) => ({
  id: 'wo-1',
  locationId: 'loc-1',
  feederId: 'feeder-1',
  assetId: null,
  location: { up3: 'UP3 X', rtuppId: 'rtupp-1', locationType: 'GI' },
  team: { name: 'PT ARHADI' },
  ...over,
});

/** A submittable persisted report (status inti + hasil pekerjaan terisi). */
const submittable = (over: Record<string, unknown> = {}) => ({
  id: 'har-1',
  workOrderId: 'wo-1',
  locationId: 'loc-1',
  inspectorId: 'petugas-1',
  status: 'DRAFT',
  statusGarduSesudah: 'INSCAN',
  statusPekerjaan: 'SELESAI',
  penanganan: { hasil: 'Normal kembali' },
  location: { code: 'GI-PLP', rtuppId: 'rtupp-1' },
  ...over,
});

function makeRepo(over: Record<string, any> = {}) {
  return {
    workOrderById: vi.fn().mockResolvedValue(woRow()),
    feederExists: vi.fn().mockResolvedValue(true),
    findById: vi.fn(),
    create: vi.fn().mockImplementation(async (data) => ({ id: 'har-1', ...data })),
    update: vi.fn().mockImplementation(async (id, data) => ({
      id, location: { code: 'GI-PLP', rtuppId: 'rtupp-1' }, inspectorId: 'petugas-1', ...data,
    })),
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('createLaporanHarGiSchema', () => {
  it('requires workOrderId (HAR selalu ber-WO)', () => {
    expect(createLaporanHarGiSchema.safeParse({ reportDate: new Date() }).success).toBe(false);
    expect(createLaporanHarGiSchema.safeParse({ workOrderId: 'wo-1', reportDate: new Date() }).success).toBe(true);
  });
  it('menolak tanggal masa depan', () => {
    const future = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    expect(createLaporanHarGiSchema.safeParse({ workOrderId: 'wo-1', reportDate: future }).success).toBe(false);
  });
  it('penyebabGangguan = array string (chips)', () => {
    const r = createLaporanHarGiSchema.safeParse({ workOrderId: 'wo-1', reportDate: new Date(), penyebabGangguan: ['BATERAI', 'RELAY'] });
    expect(r.success).toBe(true);
  });
});

describe('LaporanHarGiService.create — identitas auto-fill dari WO', () => {
  it('derives location/feeder/up3/pelaksana from the WO; inspector = actor', async () => {
    const repo = makeRepo();
    const svc = new LaporanHarGiService(repo as any);
    const res: any = await svc.create({ workOrderId: 'wo-1', reportDate: new Date() } as any, petugas, scope);
    expect(res.workOrderId).toBe('wo-1');
    expect(res.locationId).toBe('loc-1');
    expect(res.feederId).toBe('feeder-1');
    expect(res.up3).toBe('UP3 X');
    expect(res.pelaksana).toBe('PT ARHADI');
    expect(res.inspectorId).toBe('petugas-1');
    expect(res.status).toBe('DRAFT');
  });

  it('404 when WO not found / out of RTUPP scope', async () => {
    const repo = makeRepo({ workOrderById: vi.fn().mockResolvedValue(null) });
    const svc = new LaporanHarGiService(repo as any);
    await expect(svc.create({ workOrderId: 'wo-x', reportDate: new Date() } as any, petugas, scope)).rejects.toThrowError(NotFoundError);
  });

  it('403 when the WO location is in another RTUPP (cross-tenant guard)', async () => {
    const repo = makeRepo({ workOrderById: vi.fn().mockResolvedValue(woRow({ location: { up3: 'X', rtuppId: 'rtupp-OTHER', locationType: 'GI' } })) });
    const svc = new LaporanHarGiService(repo as any);
    await expect(svc.create({ workOrderId: 'wo-1', reportDate: new Date() } as any, petugas, scope)).rejects.toThrowError(ForbiddenError);
  });

  it('gerbang Laporan Awal: create() checks assertLaporanAwalSubmitted with WO id + requiredReports', async () => {
    const repo = makeRepo({ workOrderById: vi.fn().mockResolvedValue(woRow({ requiredReports: ['HAR'] })) });
    const svc = new LaporanHarGiService(repo as any);
    await svc.create({ workOrderId: 'wo-1', reportDate: new Date() } as any, petugas, scope);
    expect(assertLaporanAwalSubmitted).toHaveBeenCalledWith('wo-1', ['HAR']);
  });

  it('gerbang Laporan Awal: create() rejects (422) when no Laporan Awal submitted yet', async () => {
    (assertLaporanAwalSubmitted as any).mockRejectedValueOnce(new BusinessRuleError('Isi Laporan Awal terlebih dahulu'));
    const repo = makeRepo();
    const svc = new LaporanHarGiService(repo as any);
    await expect(svc.create({ workOrderId: 'wo-1', reportDate: new Date() } as any, petugas, scope)).rejects.toThrowError(BusinessRuleError);
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe('LaporanHarGiService.submit — mark SUBMITTED + delegate to WO', () => {
  it('marks SUBMITTED and calls workOrderService.onLinkedReportSubmitted (no resultMapping)', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(submittable()) });
    const svc = new LaporanHarGiService(repo as any);
    const res: any = await svc.submit('har-1', petugas, scope);
    expect(res.status).toBe('SUBMITTED');
    expect(workOrderService.onLinkedReportSubmitted).toHaveBeenCalledWith('wo-1', {}, petugas, scope);
  });

  it('checks assertWoNotRejected with the linked WO status before allowing submit', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(submittable({ workOrder: { id: 'wo-1', status: 'ON_PROGRESS' } })) });
    const svc = new LaporanHarGiService(repo as any);
    await svc.submit('har-1', petugas, scope);
    expect(assertWoNotRejected).toHaveBeenCalledWith('ON_PROGRESS');
  });

  it('blocks submit when the linked WO is REJECTED ("Tidak Sesuai"), even if report status allows it', async () => {
    (assertWoNotRejected as any).mockImplementationOnce(() => {
      throw new BusinessRuleError('Work Order ini berstatus Tidak Sesuai — laporan tidak dapat diubah');
    });
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(submittable({ workOrder: { id: 'wo-1', status: 'REJECTED' } })) });
    const svc = new LaporanHarGiService(repo as any);
    await expect(svc.submit('har-1', petugas, scope)).rejects.toThrowError(BusinessRuleError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rejects submit when minimal fields missing (Hasil/Status)', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(submittable({ penanganan: {}, statusGarduSesudah: null })) });
    const svc = new LaporanHarGiService(repo as any);
    await expect(svc.submit('har-1', petugas, scope)).rejects.toThrowError(ValidationError);
    expect(workOrderService.onLinkedReportSubmitted).not.toHaveBeenCalled();
  });
});

describe('LaporanHarGiService.update — WO-lock guard', () => {
  it('checks assertWoNotRejected before allowing an update', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(submittable({ workOrder: { id: 'wo-1', status: 'ON_PROGRESS' } })) });
    const svc = new LaporanHarGiService(repo as any);
    await svc.update('har-1', {}, petugas, scope);
    expect(assertWoNotRejected).toHaveBeenCalledWith('ON_PROGRESS');
  });

  it('blocks update when the linked WO is REJECTED', async () => {
    (assertWoNotRejected as any).mockImplementationOnce(() => {
      throw new BusinessRuleError('Work Order ini berstatus Tidak Sesuai — laporan tidak dapat diubah');
    });
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(submittable({ workOrder: { id: 'wo-1', status: 'REJECTED' } })) });
    const svc = new LaporanHarGiService(repo as any);
    await expect(svc.update('har-1', {}, petugas, scope)).rejects.toThrowError(BusinessRuleError);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('LaporanHarGiService.decide — approval via WO only', () => {
  it('rejects standalone decide for a WO-linked report (one path via WO)', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(submittable({ status: 'SUBMITTED', workOrderId: 'wo-1' })) });
    const svc = new LaporanHarGiService(repo as any);
    await expect(svc.decide('har-1', { decision: 'VALIDATED' } as any, { userId: 'admin-1', role: 'ADMIN' }, scope)).rejects.toThrowError(BusinessRuleError);
  });

  it('forbids reading another officer\'s report (own-records)', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(submittable({ inspectorId: 'someone-else' })) });
    const svc = new LaporanHarGiService(repo as any);
    await expect(svc.getById('har-1', petugas, scope)).rejects.toThrowError(ForbiddenError);
  });
});
