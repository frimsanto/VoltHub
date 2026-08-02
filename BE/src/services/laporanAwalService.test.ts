import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../config/database');
vi.mock('../utils/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./pushService', () => ({ sendToUser: vi.fn().mockResolvedValue(undefined) }));

import prisma, { resetPrismaMock } from '../config/database';
import {
  getAllLaporanAwal,
  getLaporanAwalById,
  updateLaporanAwal,
  deleteLaporanAwal,
} from './laporanAwalService';

const anyPrisma = prisma as any;

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

describe('getAllLaporanAwal (role-based filtering + pagination)', () => {
  it('PETUGAS only sees their own reports', async () => {
    anyPrisma.laporanAwal.findMany.mockResolvedValue([]);
    anyPrisma.laporanAwal.count.mockResolvedValue(0);
    await getAllLaporanAwal('petugas-1', 'PETUGAS', { page: 1, limit: 10 });
    const args = anyPrisma.laporanAwal.findMany.mock.calls[0][0];
    expect(args.where.createdById).toBe('petugas-1');
  });

  it('ADMIN_RTUPP sees all reports (no createdById filter) and applies status/search', async () => {
    anyPrisma.laporanAwal.findMany.mockResolvedValue([]);
    anyPrisma.laporanAwal.count.mockResolvedValue(25);
    const result = await getAllLaporanAwal('admin-1', 'ADMIN_RTUPP', {
      page: 2,
      limit: 10,
      status: 'PENDING',
      search: 'gardu',
    });
    const args = anyPrisma.laporanAwal.findMany.mock.calls[0][0];
    expect(args.where.createdById).toBeUndefined();
    expect(args.where.status).toBe('PENDING');
    expect(args.where.OR).toBeTruthy();
    expect(args.skip).toBe(10);
    expect(result.meta.totalPages).toBe(3);
  });
});

describe('getLaporanAwalById (access control)', () => {
  it('throws "not found" when missing', async () => {
    anyPrisma.laporanAwal.findUnique.mockResolvedValue(null);
    await expect(getLaporanAwalById('x', 'u', 'ADMIN_RTUPP')).rejects.toThrow(/not found/);
  });

  it('denies a PETUGAS access to another user report', async () => {
    anyPrisma.laporanAwal.findUnique.mockResolvedValue({ id: 'r', createdById: 'other' });
    await expect(getLaporanAwalById('r', 'petugas-1', 'PETUGAS')).rejects.toThrow(/Access denied/);
  });

  it('allows a PETUGAS to read their own report', async () => {
    const row = { id: 'r', createdById: 'petugas-1' };
    anyPrisma.laporanAwal.findUnique.mockResolvedValue(row);
    await expect(getLaporanAwalById('r', 'petugas-1', 'PETUGAS')).resolves.toBe(row);
  });
});

describe('updateLaporanAwal (status guards)', () => {
  it('blocks a PETUGAS from editing a locked (validator-acted) report', async () => {
    // REVISED is a validator-acted, locked state; PENDING/DRAFT remain editable.
    anyPrisma.laporanAwal.findUnique.mockResolvedValue({
      id: 'r', createdById: 'petugas-1', status: 'REVISED',
    });
    await expect(
      updateLaporanAwal('r', {} as any, 'petugas-1', 'PETUGAS')
    ).rejects.toThrow(/locked/);
  });

  it('blocks editing an APPROVED report unless SUPERADMIN', async () => {
    anyPrisma.laporanAwal.findUnique.mockResolvedValue({
      id: 'r', createdById: 'admin-1', status: 'APPROVED',
    });
    await expect(
      updateLaporanAwal('r', {} as any, 'admin-1', 'ADMIN_RTUPP')
    ).rejects.toThrow(/approved/);
  });

  it('performs the DRAFT -> PENDING submit transition', async () => {
    anyPrisma.laporanAwal.findUnique.mockResolvedValue({
      id: 'r', createdById: 'petugas-1', status: 'DRAFT',
    });
    anyPrisma.laporanAwal.update.mockImplementation(async ({ data }: any) => ({
      id: 'r', reportId: 'LA-2026-001', ...data,
    }));
    const result = await updateLaporanAwal('r', { status: 'PENDING' } as any, 'petugas-1', 'PETUGAS');
    expect(result.status).toBe('PENDING');
    const updateArgs = anyPrisma.laporanAwal.update.mock.calls[0][0];
    expect(updateArgs.data.submittedAt).toBeInstanceOf(Date);
  });
});

describe('deleteLaporanAwal (status guards)', () => {
  it('throws "not found" when missing', async () => {
    anyPrisma.laporanAwal.findUnique.mockResolvedValue(null);
    await expect(deleteLaporanAwal('x', 'u', 'ADMIN_RTUPP')).rejects.toThrow(/not found/);
  });

  it('blocks a PETUGAS from deleting a locked (validator-acted) report', async () => {
    anyPrisma.laporanAwal.findUnique.mockResolvedValue({
      id: 'r', createdById: 'petugas-1', status: 'REVISED',
    });
    await expect(deleteLaporanAwal('r', 'petugas-1', 'PETUGAS')).rejects.toThrow(/locked/);
  });

  it('deletes a DRAFT report owned by the petugas', async () => {
    anyPrisma.laporanAwal.findUnique.mockResolvedValue({
      id: 'r', createdById: 'petugas-1', status: 'DRAFT', reportId: 'LA-2026-001',
    });
    anyPrisma.laporanAwal.delete.mockResolvedValue({ id: 'r' });
    const result = await deleteLaporanAwal('r', 'petugas-1', 'PETUGAS');
    expect(result.message).toMatch(/deleted/);
    expect(anyPrisma.laporanAwal.delete).toHaveBeenCalledOnce();
  });
});
