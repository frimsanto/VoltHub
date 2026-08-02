import { describe, it, expect, vi } from 'vitest';

// Stub side-effects (no DB / no I/O).
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
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/appError';
import { LaporanInspeksiMpService } from './laporan-inspeksi-mp.service';
import { createLaporanInspeksiMpSchema } from './laporan-inspeksi-mp.validation';

const scope = { global: false, rtuppId: 'rtupp-2' } as any;
const petugas = { userId: 'petugas-1', role: 'PETUGAS' };

// Entri kubikel lengkap (memenuhi field inti wajib submit).
const kubOk = (over: Record<string, unknown> = {}) => ({
  penyulangId: 'feed-1',
  namaGardu: 'GD SUDIRMAN',
  statusCubicle: 'CLOSE',
  statusRc: 'SIAP RC',
  ...over,
});

const ok = (extra: Record<string, unknown> = {}) => ({ kesimpulan: 'BAIK', ...extra });

// Baris tersimpan yang submittable (semua section aktif ada kesimpulan + kubikel array valid).
const completeReport = (over: Record<string, unknown> = {}) => ({
  id: 'mp-1',
  locationId: 'loc-1',
  workOrderId: 'wo-1',
  inspectorId: 'petugas-1',
  status: 'DRAFT',
  statusRc: 'SIAP RC',
  location: { code: 'GD0004', rtuppId: 'rtupp-2' },
  supplyTr: ok(),
  rectifier: ok(),
  baterai: ok(),
  rtu: ok(),
  media1: ok(),
  media2: { tidakAda: true },
  kubikel: [kubOk(), kubOk({ penyulangId: null, namaGardu: 'MANUAL GARDU' })],
  fdiRelay: { tidakAda: true },
  aco: { tidakAda: true },
  ...over,
});

function makeRepo(over: Record<string, any> = {}) {
  return {
    workOrderById: vi.fn().mockResolvedValue({
      id: 'wo-1',
      locationId: 'loc-1',
      location: { up3: 'UP3 X', rtuppId: 'rtupp-2', locationType: 'GARDU', supplyFeederId: null },
      team: { name: 'PT ARHADI' },
    }),
    searchGardu: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    findAllUnpaged: vi.fn().mockResolvedValue([]),
    findImported: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async (data: any) => ({ id: 'mp-1', ...data })),
    update: vi
      .fn()
      .mockImplementation(async (id: string, data: any) => ({
        id,
        location: { code: 'GD0004', rtuppId: 'rtupp-2' },
        inspectorId: 'petugas-1',
        workOrderId: 'wo-1',
        ...data,
      })),
    ...over,
  };
}

const admin = { userId: 'admin-1', role: 'ADMIN' };

const baseQuery = { page: 1, limit: 20 } as any;

const svc = (repo: any) => new LaporanInspeksiMpService(repo as any);

describe('createLaporanInspeksiMpSchema — workOrderId WAJIB', () => {
  it('menolak create tanpa workOrderId', () => {
    const r = createLaporanInspeksiMpSchema.safeParse({ reportDate: '2024-11-05', kubikel: [kubOk()] });
    expect(r.success).toBe(false);
  });
  it('menerima create dengan workOrderId + kubikel array', () => {
    const r = createLaporanInspeksiMpSchema.safeParse({
      workOrderId: 'wo-1',
      reportDate: '2024-11-05',
      kubikel: [kubOk(), kubOk({ penyulangId: null, namaGardu: 'MANUAL' })],
    });
    expect(r.success).toBe(true);
  });
  it('menolak entri kubikel tanpa namaGardu', () => {
    const r = createLaporanInspeksiMpSchema.safeParse({
      workOrderId: 'wo-1',
      reportDate: '2024-11-05',
      kubikel: [{ penyulangId: 'x', statusCubicle: 'OPEN' }],
    });
    expect(r.success).toBe(false);
  });
  it('mengabaikan locationId kiriman FE (identitas dari WO)', () => {
    const r = createLaporanInspeksiMpSchema.safeParse({
      workOrderId: 'wo-1',
      reportDate: '2024-11-05',
      locationId: 'SPOOF',
    } as any);
    expect(r.success).toBe(true);
    expect((r as any).data.locationId).toBeUndefined();
  });
});

describe('create — identitas auto dari WO', () => {
  it('menyimpan kubikel array + identitas dari WO (bukan dari FE)', async () => {
    const repo = makeRepo();
    const created = await svc(repo).create(
      { workOrderId: 'wo-1', reportDate: new Date('2024-11-05'), kubikel: [kubOk(), kubOk()] } as any,
      petugas,
      scope,
    );
    expect(repo.create).toHaveBeenCalledOnce();
    const arg = repo.create.mock.calls[0][0];
    expect(arg.locationId).toBe('loc-1');
    expect(arg.workOrderId).toBe('wo-1');
    expect(arg.pelaksana).toBe('PT ARHADI');
    expect(Array.isArray(arg.kubikel)).toBe(true);
    expect(arg.kubikel).toHaveLength(2);
    // statusRc di-promote dari entri pertama.
    expect(arg.statusRc).toBe('SIAP RC');
    expect(arg.statusCubicle).toBe('CLOSE');
  });

  it('feederId diambil dari Location.supplyFeederId, bukan wo.feederId', async () => {
    const repo = makeRepo({
      workOrderById: vi.fn().mockResolvedValue({
        id: 'wo-1',
        locationId: 'loc-1',
        feederId: 'SHOULD_NOT_BE_USED',
        location: { up3: 'UP3 X', rtuppId: 'rtupp-2', locationType: 'GARDU', supplyFeederId: 'feed-supply-1' },
        team: { name: 'PT ARHADI' },
      }),
    });
    await svc(repo).create(
      { workOrderId: 'wo-1', reportDate: new Date('2024-11-05'), kubikel: [kubOk()] } as any,
      petugas,
      scope,
    );
    const arg = repo.create.mock.calls[0][0];
    expect(arg.feederId).toBe('feed-supply-1');
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

  it('menolak WO di luar RTUPP → 403 Forbidden', async () => {
    const repo = makeRepo({
      workOrderById: vi.fn().mockResolvedValue({
        id: 'wo-9',
        locationId: 'loc-9',
        location: { up3: 'UP3 Y', rtuppId: 'rtupp-9', locationType: 'GARDU', supplyFeederId: null },
        team: { name: 'PT Z' },
      }),
    });
    await expect(
      svc(repo).create({ workOrderId: 'wo-9', reportDate: new Date('2024-11-05') } as any, petugas, scope),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('menolak WO tidak ditemukan → 404', async () => {
    const repo = makeRepo({ workOrderById: vi.fn().mockResolvedValue(null) });
    await expect(
      svc(repo).create({ workOrderId: 'ghost', reportDate: new Date('2024-11-05') } as any, petugas, scope),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('menolak WO berlokasi non-GARDU', async () => {
    const repo = makeRepo({
      workOrderById: vi.fn().mockResolvedValue({
        id: 'wo-2',
        locationId: 'loc-2',
        location: { up3: 'UP3 X', rtuppId: 'rtupp-2', locationType: 'GI', supplyFeederId: null },
        team: { name: 'PT X' },
      }),
    });
    await expect(
      svc(repo).create({ workOrderId: 'wo-2', reportDate: new Date('2024-11-05') } as any, petugas, scope),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('submit — assertSubmittable ARRAY-AWARE kubikel', () => {
  it('menolak bila kubikel kosong/absen', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(completeReport({ kubikel: [] })) });
    await expect(svc(repo).submit('mp-1', petugas, scope)).rejects.toBeInstanceOf(ValidationError);
  });

  it('menolak bila entri kubikel kurang field inti (statusRc)', async () => {
    const bad = completeReport({ kubikel: [{ namaGardu: 'GD A', statusCubicle: 'CLOSE' }] });
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(bad) });
    await expect(svc(repo).submit('mp-1', petugas, scope)).rejects.toBeInstanceOf(ValidationError);
  });

  it('menerima bila ≥1 entri lengkap & semua section aktif ok', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(completeReport()) });
    const res = await svc(repo).submit('mp-1', petugas, scope);
    expect(repo.update).toHaveBeenCalled();
    expect(res.status).toBe('SUBMITTED');
  });

  it('menolak submit bila WO tertaut berstatus REJECTED ("Tidak Sesuai")', async () => {
    (assertWoNotRejected as any).mockImplementationOnce(() => {
      throw new BusinessRuleError('Work Order ini berstatus Tidak Sesuai — laporan tidak dapat diubah');
    });
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(completeReport({ workOrder: { id: 'wo-1', status: 'REJECTED' } })),
    });
    await expect(svc(repo).submit('mp-1', petugas, scope)).rejects.toThrowError(BusinessRuleError);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('searchGardu — scoped', () => {
  it('mengembalikan array gardu dengan feederId/feederName dari supplyFeeder', async () => {
    const repo = makeRepo({
      searchGardu: vi.fn().mockResolvedValue([
        { id: 'g1', code: 'GD001', name: 'Gardu A', up3: 'UP3 X', supplyFeederId: 'f1', supplyFeeder: { id: 'f1', feederCode: 'P1', feederName: 'PS A' } },
      ]),
    });
    const res = await svc(repo).searchGardu('GD00', scope, 20);
    expect(res).toHaveLength(1);
    expect(res[0].feederId).toBe('f1');
    expect(res[0].feederName).toBe('PS A');
    expect(repo.searchGardu).toHaveBeenCalledWith('GD00', scope, 20);
  });
  it('gardu tanpa supplyFeeder → feederId/feederName null', async () => {
    const repo = makeRepo({
      searchGardu: vi.fn().mockResolvedValue([
        { id: 'g2', code: 'GD002', name: 'Gardu B', up3: 'UP3 X', supplyFeederId: null, supplyFeeder: null },
      ]),
    });
    const res = await svc(repo).searchGardu('GD00', scope, 20);
    expect(res[0].feederId).toBeNull();
    expect(res[0].feederName).toBeNull();
  });
});

describe('list — gabung data historis import (inspeksi_gardu_records)', () => {
  const importedRow = (over: Record<string, unknown> = {}) => ({
    id: 'imp-1',
    tanggalPekerjaan: new Date('2024-01-01'),
    kodeGardu: 'GD0009',
    up3: 'UP3 X',
    penyulang: 'PS A',
    pelaksana: 'TIM LAMA',
    statusScada: 'OOP',
    statusRc: 'TIDAK SIAP RC',
    catatan: 'Catatan lapangan',
    kesimpulanRectifier: 'BAIK',
    keteranganRectifier: null,
    kesimpulanBaterai: 'BAIK',
    keteranganBaterai: null,
    kesimpulanRtu: 'BAIK',
    keteranganRtu: null,
    kesimpulanMedia: 'BAIK',
    keteranganMedia: null,
    locationId: null,
    createdAt: new Date('2024-01-02'),
    location: null,
    ...over,
  });

  it('menggabungkan native + imported, sort desc by tanggal, meta.total gabungan', async () => {
    const repo = makeRepo({
      findAllUnpaged: vi.fn().mockResolvedValue([
        { id: 'mp-native-1', reportDate: new Date('2024-06-01'), createdAt: new Date('2024-06-01'), status: 'DRAFT' },
      ]),
      findImported: vi.fn().mockResolvedValue([importedRow({ tanggalPekerjaan: new Date('2024-01-01') })]),
    });
    const res = await svc(repo).list(baseQuery, admin, scope);
    expect(repo.findAllUnpaged).toHaveBeenCalledWith(baseQuery, scope, { restrictToUserId: null });
    expect(repo.findImported).toHaveBeenCalledWith(baseQuery, scope);
    expect(res.meta.total).toBe(2);
    expect(res.data[0]).toMatchObject({ id: 'mp-native-1', isImported: false });
    expect(res.data[1]).toMatchObject({ id: 'imp-1', isImported: true, statusScada: 'OOP', status: null });
  });

  it('tidak memanggil findImported saat workOrderId di-filter (lookup per-WO)', async () => {
    const repo = makeRepo();
    await svc(repo).list({ ...baseQuery, workOrderId: 'wo-1' }, admin, scope);
    expect(repo.findImported).not.toHaveBeenCalled();
    expect(repo.findAll).toHaveBeenCalledOnce();
  });

  it('tidak memanggil findImported saat status di-filter', async () => {
    const repo = makeRepo();
    await svc(repo).list({ ...baseQuery, status: 'SUBMITTED' }, admin, scope);
    expect(repo.findImported).not.toHaveBeenCalled();
  });

  it('tidak memanggil findImported utk PETUGAS (riwayat "punya saya" saja)', async () => {
    const repo = makeRepo();
    await svc(repo).list(baseQuery, petugas, scope);
    expect(repo.findImported).not.toHaveBeenCalled();
    expect(repo.findAll).toHaveBeenCalledWith(baseQuery, scope, { restrictToUserId: 'petugas-1' });
  });
});
