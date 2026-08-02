import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../config/database');
vi.mock('../utils/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./pushService', () => ({ sendToUser: vi.fn().mockResolvedValue(undefined) }));

import prisma, { resetPrismaMock } from '../config/database';
import { createLaporanAwal } from './laporanAwalService';

const anyPrisma = prisma as any;
const YEAR = new Date().getFullYear();

const inputData: any = {
  hari: 'Senin',
  tanggal: '2026-06-02',
  up3: 'UP3 Test',
  pekerjaan: 'Pemeliharaan',
  lokasiGardu: 'GD-01',
};

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
  // User always exists.
  anyPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
});

describe('report ID generator', () => {
  it('creates the first report of the year as -001', async () => {
    anyPrisma.laporanAwal.findFirst.mockResolvedValue(null);
    anyPrisma.laporanAwal.create.mockImplementation(async ({ data }: any) => ({
      id: 'r1',
      reportId: data.reportId,
    }));

    const result = await createLaporanAwal(inputData, 'user-1');
    expect(result.reportId).toBe(`LA-${YEAR}-001`);
  });

  it('continues the sequence after existing reports (delete leaves a gap, derives from latest)', async () => {
    // Most-recent existing report is -005 -> next must be -006.
    anyPrisma.laporanAwal.findFirst.mockResolvedValue({ reportId: `LA-${YEAR}-005` });
    anyPrisma.laporanAwal.create.mockImplementation(async ({ data }: any) => ({
      id: 'r6',
      reportId: data.reportId,
    }));

    const result = await createLaporanAwal(inputData, 'user-1');
    expect(result.reportId).toBe(`LA-${YEAR}-006`);
  });

  it('retries on a unique-constraint collision (concurrent create) and succeeds without duplication', async () => {
    anyPrisma.laporanAwal.findFirst
      .mockResolvedValueOnce(null) // attempt 1 -> -001
      .mockResolvedValueOnce({ reportId: `LA-${YEAR}-001` }); // attempt 2 sees the winner -> -002

    let calls = 0;
    anyPrisma.laporanAwal.create.mockImplementation(async ({ data }: any) => {
      calls++;
      if (calls === 1) {
        // Simulate the DB rejecting the duplicate id from a racing request.
        throw { code: 'P2002' };
      }
      return { id: 'r2', reportId: data.reportId };
    });

    const result = await createLaporanAwal(inputData, 'user-1');
    expect(calls).toBe(2);
    expect(result.reportId).toBe(`LA-${YEAR}-002`);
  });

  it('throws if the user no longer exists', async () => {
    anyPrisma.user.findUnique.mockResolvedValue(null);
    await expect(createLaporanAwal(inputData, 'ghost')).rejects.toThrow(/tidak ditemukan/);
  });
});
