import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockResponse } from '../__tests__/helpers/http';

vi.mock('../config/database');

import prisma, { resetPrismaMock } from '../config/database';
import { getRekap, exportRekapXlsx } from './rekapController';
import type { AuthRequest } from '../middlewares/auth';

const anyPrisma = prisma as any;

const sampleRow = {
  reportId: 'LA-2026-001',
  nomorSPJ: 'SPJ-1',
  tanggal: new Date('2026-06-01'),
  status: 'APPROVED',
  createdBy: { name: 'Petugas Satu', rtupp: null, team: null },
  createdAt: new Date('2026-06-01'),
  approvedAt: new Date('2026-06-01'),
  _count: { attachments: 2 },
};

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

describe('getRekap', () => {
  it('returns paginated items + summary for an ADMIN_RTUPP (no rtupp scoping)', async () => {
    anyPrisma.laporanAwal.findMany.mockResolvedValue([sampleRow]);
    anyPrisma.laporanAwal.count.mockResolvedValue(1);
    anyPrisma.laporanAwal.groupBy.mockResolvedValue([
      { status: 'APPROVED', _count: { _all: 1 } },
    ]);

    const req = {
      user: { userId: 'admin-1', role: 'ADMIN_RTUPP' },
      query: { page: '1', limit: '20' },
    } as unknown as AuthRequest;
    const res = mockResponse();
    await getRekap(req, res);

    expect(res._status).toBe(200);
    const body = res._json as any;
    expect(body.data.items).toHaveLength(1);
    expect(body.data.pagination.total).toBe(1);
    expect(body.data.summary.approved).toBe(1);
  });

  it('honors pagination params (page 2, limit 5 -> skip 5)', async () => {
    anyPrisma.laporanAwal.findMany.mockResolvedValue([]);
    anyPrisma.laporanAwal.count.mockResolvedValue(12);
    anyPrisma.laporanAwal.groupBy.mockResolvedValue([]);

    const req = {
      user: { userId: 'admin-1', role: 'ADMIN_RTUPP' },
      query: { page: '2', limit: '5' },
    } as unknown as AuthRequest;
    const res = mockResponse();
    await getRekap(req, res);

    const findArgs = anyPrisma.laporanAwal.findMany.mock.calls[0][0];
    expect(findArgs.skip).toBe(5);
    expect(findArgs.take).toBe(5);
    const body = res._json as any;
    expect(body.data.pagination.totalPages).toBe(3); // ceil(12/5)
  });

  it('applies a status filter to the where clause', async () => {
    anyPrisma.laporanAwal.findMany.mockResolvedValue([]);
    anyPrisma.laporanAwal.count.mockResolvedValue(0);
    anyPrisma.laporanAwal.groupBy.mockResolvedValue([]);

    const req = {
      user: { userId: 'admin-1', role: 'ADMIN_RTUPP' },
      query: { status: 'PENDING' },
    } as unknown as AuthRequest;
    const res = mockResponse();
    await getRekap(req, res);

    const findArgs = anyPrisma.laporanAwal.findMany.mock.calls[0][0];
    expect(findArgs.where.status).toBe('PENDING');
  });

  it('401 when unauthenticated', async () => {
    const req = { query: {} } as unknown as AuthRequest;
    const res = mockResponse();
    await getRekap(req, res);
    expect(res._status).toBe(401);
  });

  it('ADMIN is global (2026-07 policy): no rtupp filter even without an assigned rtupp', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({ rtuppId: null });
    anyPrisma.laporanAwal.findMany.mockResolvedValue([]);
    anyPrisma.laporanAwal.count.mockResolvedValue(0);
    anyPrisma.laporanAwal.groupBy.mockResolvedValue([]);
    const req = {
      user: { userId: 'ar-1', role: 'ADMIN' },
      query: {},
    } as unknown as AuthRequest;
    const res = mockResponse();
    await getRekap(req, res);
    expect(res._status).toBe(200);
    const findArgs = anyPrisma.laporanAwal.findMany.mock.calls[0][0];
    expect(findArgs.where.createdBy).toBeUndefined(); // global view, no RTUPP predicate
  });
});

describe('exportRekapXlsx', () => {
  it('streams an XLSX attachment and logs the export', async () => {
    anyPrisma.laporanAwal.findMany.mockResolvedValue([sampleRow]);
    anyPrisma.activityLog.create.mockResolvedValue({ id: 'log-1' });

    const req = {
      user: { userId: 'admin-1', role: 'ADMIN_RTUPP' },
      query: {},
    } as unknown as AuthRequest;
    const res = mockResponse();
    await exportRekapXlsx(req, res);

    expect(res._headers['Content-Type']).toContain('spreadsheetml');
    expect(res._headers['Content-Disposition']).toContain('attachment');
    expect(res._ended).toBe(true);
    expect(anyPrisma.activityLog.create).toHaveBeenCalledOnce();
  });

  it('respects an explicit columns selection', async () => {
    anyPrisma.laporanAwal.findMany.mockResolvedValue([]);
    anyPrisma.activityLog.create.mockResolvedValue({ id: 'log-2' });

    const req = {
      user: { userId: 'admin-1', role: 'ADMIN_RTUPP' },
      query: { columns: 'reportId,status,unknownColIgnored' },
    } as unknown as AuthRequest;
    const res = mockResponse();
    await exportRekapXlsx(req, res);

    const logArgs = anyPrisma.activityLog.create.mock.calls[0][0];
    const details = JSON.parse(logArgs.data.details);
    expect(details.columns).toEqual(['reportId', 'status']);
  });
});
