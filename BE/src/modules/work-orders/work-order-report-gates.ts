import prisma from '../../config/database';
import { BusinessRuleError } from '../../utils/appError';

/** Normalize the WO's `requiredReports` JSON into a string array (null/invalid → []). */
function toReportList(requiredReports: unknown): string[] {
  return Array.isArray(requiredReports) ? requiredReports.filter((r): r is string => typeof r === 'string') : [];
}

/**
 * Gerbang: laporan wajib (GI/HAR/Inspeksi GH/HAR GH) sebuah WO tidak boleh dibuat
 * sebelum Laporan Awal WO tersebut ada & sudah dikirim (bukan DRAFT). WO legacy
 * (requiredReports null/kosong) tidak digerbang — lolos otomatis.
 */
export async function assertLaporanAwalSubmitted(workOrderId: string, requiredReports: unknown): Promise<void> {
  if (toReportList(requiredReports).length === 0) return;

  const count = await prisma.laporanAwal.count({
    where: { workOrderId, status: { not: 'DRAFT' } },
  });
  if (count === 0) {
    throw new BusinessRuleError('Isi Laporan Awal terlebih dahulu');
  }
}
