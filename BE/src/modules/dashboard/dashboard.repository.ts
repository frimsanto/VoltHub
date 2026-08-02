import { AssetStatus, AssetType, WorkOrderStatus, DocumentType } from '@prisma/client';
import prisma from '../../config/database';

/**
 * Dashboard Repository — single aggregation pass for the management overview.
 *
 * Replaces the frontend's ~30-request fan-out (one tiny count query per card)
 * with a handful of indexed COUNT / groupBy queries fired in parallel and
 * assembled into one payload. Soft-deleted rows (deletedAt) are excluded so the
 * figures match the list endpoints. This is the same "aggregate on the server,
 * one round-trip" contract the KPI dashboard already follows.
 *
 * Data sources (the V1 `inspections` / `har_reports` / `tickets` tables are
 * dead — always empty — so the cards read the tables the app actually writes):
 *  - Inspection  → InspeksiGarduRecord (bulk historical corpus, `tanggalPekerjaan`)
 *  - HAR         → LaporanHarGi + LaporanHarGh + LaporanHarMp (live WO-gated
 *                  reports, `reportDate`) — there is no HAR equivalent of the
 *                  historical corpus
 *  - Work Order  → WorkOrder groupBy status (exposed as `ticketByStatus` to
 *                  keep the FE payload contract unchanged)
 */

const notDeleted = { deletedAt: null };

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
};

export interface DashboardAggregates {
  counts: {
    gardu: number;
    penyulang: number;
    asset: number;
    inspection: number;
    har: number;
    document: number;
    commMedia: number;
    report: number;
  };
  assetByStatus: Record<string, number>;
  assetByType: Record<string, number>;
  /** WorkOrderStatus → count (field name kept for the FE payload contract). */
  ticketByStatus: Record<string, number>;
  documentByType: Record<string, number>;
  monthly: { inspectionThisMonth: number; harThisMonth: number };
  opsTrendRaw: { inspectionDates: Date[]; harDates: Date[] };
  import: {
    total: number;
    byStatus: Record<string, number>;
    failed: number;
    rowsImported: number;
    recent: { id: string; fileName: string; status: string; createdAt: Date | null; successRows: number | null }[];
  };
  criticalAssets: {
    total: number;
    items: { id: string; assetCode: string; assetName: string; assetType: string; status: string; locationId: string; locationName: string | null }[];
  };
  recentInspections: { id: string; inspectionDate: Date; locationId: string; locationCode: string | null; findings: number }[];
  recentHar: { id: string; reportDate: Date; locationId: string; locationCode: string | null; details: number }[];
}

export class DashboardRepository {
  async getOverview(): Promise<DashboardAggregates> {
    const monthStart = startOfMonth();
    const trendSince = daysAgo(13); // 14-day window inclusive

    const [
      gardu, penyulang, asset, inspection, harGi, harGh, harMp, document, commMedia, report,
      assetStatusGroups, assetTypeGroups, woStatusGroups, documentTypeGroups,
      inspectionThisMonth, harGiThisMonth, harGhThisMonth, harMpThisMonth,
      inspectionTrend, harGiTrend, harGhTrend, harMpTrend,
      importTotal, importStatusGroups, importRowsAgg, recentImports,
      criticalTotal, criticalItems,
      recentInspections, recentHarGi, recentHarGh, recentHarMp,
    ] = await Promise.all([
      prisma.location.count({ where: notDeleted }),
      prisma.feeder.count({ where: notDeleted }),
      prisma.asset.count({ where: notDeleted }),
      prisma.inspeksiGarduRecord.count(),
      prisma.laporanHarGi.count({ where: notDeleted }),
      prisma.laporanHarGh.count({ where: notDeleted }),
      prisma.laporanHarMp.count({ where: notDeleted }),
      prisma.document.count({ where: notDeleted }),
      prisma.communicationMedia.count({ where: notDeleted }),
      prisma.generatedReport.count(),

      prisma.asset.groupBy({ by: ['status'], where: notDeleted, _count: { _all: true } }),
      prisma.asset.groupBy({ by: ['assetType'], where: notDeleted, _count: { _all: true } }),
      prisma.workOrder.groupBy({ by: ['status'], where: notDeleted, _count: { _all: true } }),
      prisma.document.groupBy({ by: ['documentType'], where: notDeleted, _count: { _all: true } }),

      prisma.inspeksiGarduRecord.count({ where: { tanggalPekerjaan: { gte: monthStart } } }),
      prisma.laporanHarGi.count({ where: { ...notDeleted, reportDate: { gte: monthStart } } }),
      prisma.laporanHarGh.count({ where: { ...notDeleted, reportDate: { gte: monthStart } } }),
      prisma.laporanHarMp.count({ where: { ...notDeleted, reportDate: { gte: monthStart } } }),

      prisma.inspeksiGarduRecord.findMany({
        where: { tanggalPekerjaan: { gte: trendSince } },
        select: { tanggalPekerjaan: true },
      }),
      prisma.laporanHarGi.findMany({ where: { ...notDeleted, reportDate: { gte: trendSince } }, select: { reportDate: true } }),
      prisma.laporanHarGh.findMany({ where: { ...notDeleted, reportDate: { gte: trendSince } }, select: { reportDate: true } }),
      prisma.laporanHarMp.findMany({ where: { ...notDeleted, reportDate: { gte: trendSince } }, select: { reportDate: true } }),

      prisma.importJob.count(),
      prisma.importJob.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.importJob.aggregate({ _sum: { successRows: true } }),
      prisma.importJob.findMany({
        take: 5, orderBy: { createdAt: 'desc' },
        select: { id: true, fileName: true, status: true, createdAt: true, successRows: true },
      }),

      prisma.asset.count({ where: { ...notDeleted, status: { in: [AssetStatus.WARNING, AssetStatus.DAMAGED] } } }),
      prisma.asset.findMany({
        where: { ...notDeleted, status: { in: [AssetStatus.WARNING, AssetStatus.DAMAGED] } },
        take: 25,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, assetCode: true, assetName: true, assetType: true, status: true,
          locationId: true, location: { select: { name: true } },
        },
      }),

      prisma.inspeksiGarduRecord.findMany({
        take: 5,
        where: { tanggalPekerjaan: { not: null } },
        orderBy: { tanggalPekerjaan: 'desc' },
        select: { id: true, tanggalPekerjaan: true, locationId: true, kodeGardu: true, location: { select: { code: true } } },
      }),
      prisma.laporanHarGi.findMany({
        take: 5, where: notDeleted, orderBy: { reportDate: 'desc' },
        select: { id: true, reportDate: true, locationId: true, location: { select: { code: true } } },
      }),
      prisma.laporanHarGh.findMany({
        take: 5, where: notDeleted, orderBy: { reportDate: 'desc' },
        select: { id: true, reportDate: true, locationId: true, location: { select: { code: true } } },
      }),
      prisma.laporanHarMp.findMany({
        take: 5, where: notDeleted, orderBy: { reportDate: 'desc' },
        select: { id: true, reportDate: true, locationId: true, location: { select: { code: true } } },
      }),
    ]);

    // Initialise every enum key to 0 so the UI always has a complete breakdown.
    const assetByStatus = Object.fromEntries(Object.values(AssetStatus).map((s) => [s, 0]));
    for (const g of assetStatusGroups) assetByStatus[g.status] = g._count._all;

    const assetByType = Object.fromEntries(Object.values(AssetType).map((t) => [t, 0]));
    for (const g of assetTypeGroups) assetByType[g.assetType] = g._count._all;

    const ticketByStatus = Object.fromEntries(Object.values(WorkOrderStatus).map((s) => [s, 0]));
    for (const g of woStatusGroups) ticketByStatus[g.status] = g._count._all;

    const documentByType = Object.fromEntries(Object.values(DocumentType).map((t) => [t, 0]));
    for (const g of documentTypeGroups) documentByType[g.documentType] = g._count._all;

    const importByStatus: Record<string, number> = {};
    for (const g of importStatusGroups) importByStatus[g.status] = g._count._all;

    const recentHar = [...recentHarGi, ...recentHarGh, ...recentHarMp]
      .sort((x, y) => y.reportDate.getTime() - x.reportDate.getTime())
      .slice(0, 5);

    return {
      counts: { gardu, penyulang, asset, inspection, har: harGi + harGh + harMp, document, commMedia, report },
      assetByStatus,
      assetByType,
      ticketByStatus,
      documentByType,
      monthly: { inspectionThisMonth, harThisMonth: harGiThisMonth + harGhThisMonth + harMpThisMonth },
      opsTrendRaw: {
        inspectionDates: inspectionTrend
          .map((i) => i.tanggalPekerjaan)
          .filter((d): d is Date => d !== null),
        harDates: [...harGiTrend, ...harGhTrend, ...harMpTrend].map((h) => h.reportDate),
      },
      import: {
        total: importTotal,
        byStatus: importByStatus,
        failed: importByStatus.FAILED ?? 0,
        rowsImported: importRowsAgg._sum.successRows ?? 0,
        recent: recentImports,
      },
      criticalAssets: {
        total: criticalTotal,
        items: criticalItems.map((a) => ({
          id: a.id,
          assetCode: a.assetCode,
          assetName: a.assetName,
          assetType: a.assetType,
          status: a.status,
          locationId: a.locationId,
          locationName: a.location?.name ?? null,
        })),
      },
      // The historical corpus has no findings/details children — 0 keeps the
      // FE `_count` reshape working unchanged.
      recentInspections: recentInspections.map((i) => ({
        id: i.id,
        inspectionDate: i.tanggalPekerjaan as Date, // non-null via `where`
        locationId: i.locationId ?? '',
        locationCode: i.location?.code ?? i.kodeGardu ?? null,
        findings: 0,
      })),
      recentHar: recentHar.map((h) => ({
        id: h.id, reportDate: h.reportDate, locationId: h.locationId,
        locationCode: h.location?.code ?? null, details: 0,
      })),
    };
  }
}

export const dashboardRepository = new DashboardRepository();
