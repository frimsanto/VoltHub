import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../config/database');
vi.mock('../utils/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./pushService', () => ({ sendToUser: vi.fn().mockResolvedValue(undefined) }));

import prisma, { resetPrismaMock } from '../config/database';
import { validateLaporanAwal } from './laporanAwalService';

const anyPrisma = prisma as any;

const pendingReport = {
  id: 'rep-1',
  reportId: 'LA-2026-001',
  status: 'PENDING',
  createdById: 'petugas-1',
};

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
  anyPrisma.laporanAwal.update.mockImplementation(async ({ data }: any) => ({
    id: 'rep-1',
    reportId: 'LA-2026-001',
    ...data,
  }));
  anyPrisma.reportValidation.create.mockResolvedValue({ id: 'v1' });
});

describe('validation flow', () => {
  it('APPROVE: PENDING -> APPROVED, stamps approvedBy/approvedAt + validation record', async () => {
    anyPrisma.laporanAwal.findUnique.mockResolvedValue(pendingReport);
    const result = await validateLaporanAwal('rep-1', 'APPROVED', 'ok', 'validator-1', 'MASTER');
    expect(result.status).toBe('APPROVED');
    expect(result.approvedById).toBe('validator-1');
    expect(anyPrisma.reportValidation.create).toHaveBeenCalledOnce();
  });

  it('REJECT: PENDING -> REJECTED, stamps rejectedBy/rejectedAt', async () => {
    anyPrisma.laporanAwal.findUnique.mockResolvedValue(pendingReport);
    const result = await validateLaporanAwal('rep-1', 'REJECTED', 'tidak lengkap', 'validator-1', 'MASTER');
    expect(result.status).toBe('REJECTED');
    expect(result.rejectedById).toBe('validator-1');
  });

  it('REVISION_REQUESTED: PENDING -> REVISED (unified status)', async () => {
    anyPrisma.laporanAwal.findUnique.mockResolvedValue(pendingReport);
    const result = await validateLaporanAwal('rep-1', 'REVISION_REQUESTED', 'perbaiki', 'validator-1', 'MASTER');
    expect(result.status).toBe('REVISED');
  });

  it('ILLEGAL transition: cannot validate an already-APPROVED report', async () => {
    anyPrisma.laporanAwal.findUnique.mockResolvedValue({ ...pendingReport, status: 'APPROVED' });
    await expect(
      validateLaporanAwal('rep-1', 'APPROVED', undefined, 'validator-1', 'MASTER')
    ).rejects.toThrow(/Can only validate pending/);
  });

  it('ILLEGAL transition: cannot validate a REJECTED report', async () => {
    anyPrisma.laporanAwal.findUnique.mockResolvedValue({ ...pendingReport, status: 'REJECTED' });
    await expect(
      validateLaporanAwal('rep-1', 'APPROVED', undefined, 'validator-1', 'MASTER')
    ).rejects.toThrow(/Can only validate pending/);
  });

  it('throws when the report does not exist', async () => {
    anyPrisma.laporanAwal.findUnique.mockResolvedValue(null);
    await expect(
      validateLaporanAwal('missing', 'APPROVED', undefined, 'validator-1', 'MASTER')
    ).rejects.toThrow(/tidak ditemukan/);
  });
});
