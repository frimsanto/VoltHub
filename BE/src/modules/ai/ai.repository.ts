import prisma from '../../config/database';
import { locationScopeWhere, viaLocationScopeWhere, type TenantScope } from '../../utils/tenantScope';

/**
 * AI Repository — read-only aggregation feeding the AI-ready asset search
 * (TDD §15 / vw_asset_summary). Resolves a free-text query to a location and
 * gathers its assets, last inspection and last HAR in one place.
 *
 * Every method takes the caller's TenantScope and applies the same
 * locationScopeWhere/viaLocationScopeWhere fragments as the rest of the app
 * (see location.repository.ts, inspection.repository.ts) — a scoped caller
 * can never resolve or aggregate a location outside their RTUPP.
 */
export class AiRepository {
  /** Resolve a location by exact code first, then a fuzzy code/name match, within scope. */
  async resolveLocation(q: string, scope: TenantScope) {
    const exact = await prisma.location.findFirst({
      where: { code: q, deletedAt: null, ...locationScopeWhere(scope) },
    });
    if (exact) return exact;

    return prisma.location.findFirst({
      where: {
        deletedAt: null,
        ...locationScopeWhere(scope),
        OR: [{ code: { contains: q, mode: 'insensitive' as const } }, { name: { contains: q, mode: 'insensitive' as const } }],
      },
      orderBy: { code: 'asc' },
    });
  }

  assetsOfLocation(locationId: string, scope: TenantScope) {
    return prisma.asset.findMany({
      where: { locationId, deletedAt: null, ...viaLocationScopeWhere(scope) },
      orderBy: { assetCode: 'asc' },
      include: {
        feeder: { select: { id: true, feederCode: true, feederName: true } },
        simCards: true,
      },
    });
  }

  communicationMediaOfLocation(locationId: string, scope: TenantScope) {
    return prisma.communicationMedia.findMany({
      where: { locationId, deletedAt: null, ...viaLocationScopeWhere(scope) },
      orderBy: { createdAt: 'desc' },
    });
  }

  lastInspection(locationId: string, scope: TenantScope) {
    return prisma.inspection.findFirst({
      where: { locationId, ...viaLocationScopeWhere(scope) },
      orderBy: { inspectionDate: 'desc' },
      include: {
        inspector: { select: { id: true, name: true } },
        findings: { include: { asset: { select: { assetCode: true, assetName: true } } } },
      },
    });
  }

  lastHar(locationId: string, scope: TenantScope) {
    return prisma.harReport.findFirst({
      where: { locationId, ...viaLocationScopeWhere(scope) },
      orderBy: { reportDate: 'desc' },
      include: { details: { include: { asset: { select: { assetCode: true, assetName: true } } } } },
    });
  }

  documentCount(locationId: string, scope: TenantScope) {
    return prisma.document.count({
      where: { locationId, deletedAt: null, ...viaLocationScopeWhere(scope) },
    });
  }
}

export const aiRepository = new AiRepository();
