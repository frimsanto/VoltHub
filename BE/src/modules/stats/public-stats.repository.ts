import prisma from '../../config/database';

/**
 * Public Stats Repository — the ONLY aggregates safe to expose without auth.
 *
 * Everything here is a whitelisted COUNT / groupBy that returns plain integers
 * (and one derived percentage). No row-level data, no codes/serials/names, no
 * coordinates, no PII — so the anonymous login page can render an operational
 * "scale of the platform" story without leaking anything sensitive. Soft-deleted
 * rows (deletedAt) are excluded so the figures match the authenticated lists.
 *
 * Queries mirror the dashboard repository's "one parallel pass of indexed
 * counts" contract. The service layer caches the result, so this runs at most
 * once per cache window regardless of public traffic.
 */

const notDeleted = { deletedAt: null };

export interface PublicStats {
  sites: number;             // total Gardu/sites (locations)
  sitesByType: Record<string, number>;
  assets: number;            // total telecom assets monitored
  assetsByType: Record<string, number>;
  feeders: number;           // total penyulang
  inspections: number;       // surveys/inspections completed
  harReports: number;        // HAR reports recorded
  performancePoints: number; // daily performance/telemetry data points
  geoCoveragePct: number;    // % of sites with lat/lng (0–100, 1 decimal)
  generatedAt: string;
}

export class PublicStatsRepository {
  async getPublicStats(): Promise<PublicStats> {
    const [
      sites,
      sitesByTypeGroups,
      geoLocated,
      assets,
      assetsByTypeGroups,
      feeders,
      inspections,
      harReports,
      performancePoints,
    ] = await Promise.all([
      prisma.location.count({ where: notDeleted }),
      prisma.location.groupBy({ by: ['locationType'], where: notDeleted, _count: { _all: true } }),
      prisma.location.count({ where: { ...notDeleted, latitude: { not: null }, longitude: { not: null } } }),
      prisma.asset.count({ where: notDeleted }),
      prisma.asset.groupBy({ by: ['assetType'], where: notDeleted, _count: { _all: true } }),
      prisma.feeder.count({ where: notDeleted }),
      prisma.inspection.count(),
      prisma.harReport.count(),
      prisma.performanceDaily.count(),
    ]);

    const sitesByType: Record<string, number> = {};
    for (const g of sitesByTypeGroups) sitesByType[g.locationType] = g._count._all;

    const assetsByType: Record<string, number> = {};
    for (const g of assetsByTypeGroups) assetsByType[g.assetType] = g._count._all;

    const geoCoveragePct = sites > 0 ? Math.round((geoLocated / sites) * 1000) / 10 : 0;

    return {
      sites,
      sitesByType,
      assets,
      assetsByType,
      feeders,
      inspections,
      harReports,
      performancePoints,
      geoCoveragePct,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const publicStatsRepository = new PublicStatsRepository();
