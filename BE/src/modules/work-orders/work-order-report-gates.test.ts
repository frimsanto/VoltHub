import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/database');

import prisma, { resetPrismaMock } from '../../config/database';
import { assertLaporanAwalSubmitted } from './work-order-report-gates';
import { BusinessRuleError } from '../../utils/appError';

const anyPrisma = prisma as any;

beforeEach(() => resetPrismaMock());

describe('assertLaporanAwalSubmitted', () => {
  it('is a no-op for a legacy WO (requiredReports null/empty) — never queries the DB', async () => {
    await assertLaporanAwalSubmitted('wo-1', null);
    await assertLaporanAwalSubmitted('wo-1', []);
    expect(anyPrisma.laporanAwal.count).not.toHaveBeenCalled();
  });

  it('throws 422 "Isi Laporan Awal terlebih dahulu" when no non-DRAFT Laporan Awal exists', async () => {
    anyPrisma.laporanAwal.count.mockResolvedValue(0);
    await expect(assertLaporanAwalSubmitted('wo-1', ['GI'])).rejects.toThrowError(BusinessRuleError);
    expect(anyPrisma.laporanAwal.count).toHaveBeenCalledWith({
      where: { workOrderId: 'wo-1', status: { not: 'DRAFT' } },
    });
  });

  it('passes when a submitted (non-DRAFT) Laporan Awal exists', async () => {
    anyPrisma.laporanAwal.count.mockResolvedValue(1);
    await expect(assertLaporanAwalSubmitted('wo-1', ['HAR'])).resolves.toBeUndefined();
  });
});
