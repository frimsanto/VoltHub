import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { Bbox } from './gis.validation';
import type { TenantScope } from '../../utils/tenantScope';

/**
 * Tenant predicate for a raw GIS query, keyed on a locations alias. GLOBAL →
 * empty fragment; restricted → `AND <alias>."rtuppId" = <id>` (value parameterized;
 * the alias is code-controlled, never user input).
 */
const scopeSql = (scope: TenantScope, alias: 'l'): Prisma.Sql =>
  scope.global ? Prisma.empty : Prisma.sql`AND ${Prisma.raw(alias)}."rtuppId" = ${scope.rtuppId}`;

/**
 * GIS Repository — the ONLY layer touching Prisma for spatial queries.
 *
 * Performance contract (see docs/GIS_MODULE.md §"Optimizing large datasets"):
 *  - The viewport `bbox` is pushed to SQL as a range predicate on
 *    (latitude, longitude) so the map only ever reads on-screen sites.
 *  - Each site's per-layer aggregates (assets / feeders / tickets / inspections)
 *    are computed with LEFT JOIN + conditional COUNT in ONE pass — never an
 *    N+1 fan-out per marker.
 *  - At low zoom the client switches to `gridClusters`, which aggregates in
 *    PostgreSQL so the payload stays bounded no matter how many sites exist.
 *  - All filters are parameterized `Prisma.Sql` fragments (no string interpolation).
 *
 * PostgreSQL note: identifiers are folded to lower case unless double-quoted,
 * so every camelCase column AND output alias below is quoted verbatim. Aliases
 * are also not visible to HAVING, so those predicates repeat the expression.
 */

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = Number(typeof v === 'bigint' ? v.toString() : String(v));
  return Number.isFinite(n) ? n : 0;
};

/** Compose the shared WHERE fragment for the geocoded-site substrate. */
const siteWhere = (f: {
  bbox?: Bbox;
  type?: string;
  up3?: string;
  search?: string;
}): Prisma.Sql => {
  const parts: Prisma.Sql[] = [
    Prisma.sql`l."deletedAt" IS NULL AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL`,
  ];
  if (f.bbox) {
    parts.push(Prisma.sql`l.latitude BETWEEN ${f.bbox.minLat} AND ${f.bbox.maxLat}`);
    parts.push(Prisma.sql`l.longitude BETWEEN ${f.bbox.minLng} AND ${f.bbox.maxLng}`);
  }
  // `locationType` is a PG enum — cast to text so the bound text parameter compares.
  if (f.type) parts.push(Prisma.sql`l."locationType"::text = ${f.type}`);
  if (f.up3) parts.push(Prisma.sql`l.up3 = ${f.up3}`);
  if (f.search) {
    const like = `%${f.search}%`;
    parts.push(Prisma.sql`(l.name LIKE ${like} OR l.code LIKE ${like})`);
  }
  return Prisma.join(parts, ' AND ');
};

export interface SiteRow {
  id: string;
  code: string;
  name: string;
  locationType: string;
  up3: string | null;
  latitude: unknown;
  longitude: unknown;
  active: number;
  assetCount: unknown;
  activeAssetCount: unknown;
  faultyAssetCount: unknown;
  feederCount: unknown;
  openTickets: unknown;
  criticalTickets: unknown;
  lastInspectionDate: Date | null;
}

export class GisRepository {
  /**
   * Site substrate: one location per row with all per-layer aggregates computed
   * in a single grouped pass. Drives Gardu / Penyulang / Asset / Inspection /
   * Report layers (the client toggles them off the same payload).
   *
   * Inspection activity has TWO sources: the V2 `inspections` module and the
   * historical import `inspeksi_gardu_records` (locationId nullable — unmatched
   * rows simply don't join). Both feed lastInspectionDate / the layer counts.
   */
  async findSites(
    filters: { bbox?: Bbox; type?: string; up3?: string; search?: string; openTickets?: boolean },
    limit: number,
    scope: TenantScope
  ): Promise<SiteRow[]> {
    const where = siteWhere(filters);
    const tenant = scopeSql(scope, 'l');
    // HAVING cannot see SELECT aliases in PostgreSQL — repeat the expression.
    const havingOpen = filters.openTickets
      ? Prisma.sql`HAVING COUNT(DISTINCT CASE WHEN t.status IN ('OPEN','ASSIGNED','IN_PROGRESS') THEN t.id END) > 0`
      : Prisma.empty;

    return prisma.$queryRaw<SiteRow[]>`
      SELECT
        l.id, l.code, l.name, l."locationType", l.up3, l.latitude, l.longitude,
        CASE WHEN l.status THEN 1 ELSE 0 END                              AS active,
        COUNT(DISTINCT a.id)                                              AS "assetCount",
        COUNT(DISTINCT CASE WHEN a.status = 'ACTIVE' THEN a.id END)       AS "activeAssetCount",
        COUNT(DISTINCT CASE WHEN a.status IN ('WARNING','DAMAGED') THEN a.id END) AS "faultyAssetCount",
        COUNT(DISTINCT f.id)                                             AS "feederCount",
        COUNT(DISTINCT CASE WHEN t.status IN ('OPEN','ASSIGNED','IN_PROGRESS') THEN t.id END) AS "openTickets",
        COUNT(DISTINCT CASE WHEN t.status IN ('OPEN','ASSIGNED','IN_PROGRESS')
                             AND t.priority = 'CRITICAL' THEN t.id END)   AS "criticalTickets",
        GREATEST(MAX(i."inspectionDate"), MAX(r."tanggalPekerjaan"))      AS "lastInspectionDate"
      FROM locations l
      LEFT JOIN assets      a ON a."locationId" = l.id AND a."deletedAt" IS NULL
      LEFT JOIN feeders     f ON f."locationId" = l.id AND f."deletedAt" IS NULL
      LEFT JOIN tickets     t ON t."locationId" = l.id AND t."deletedAt" IS NULL
      LEFT JOIN inspections i ON i."locationId" = l.id
      LEFT JOIN inspeksi_gardu_records r ON r."locationId" = l.id
      WHERE ${where} ${tenant}
      GROUP BY l.id, l.code, l.name, l."locationType", l.up3, l.latitude, l.longitude, l.status
      ${havingOpen}
      ORDER BY "openTickets" DESC, "faultyAssetCount" DESC
      LIMIT ${limit}
    `;
  }

  /** Weighted heat points. `weightExpr` is a vetted column alias (not user input). */
  async heatPoints(
    filters: { bbox?: Bbox; type?: string; up3?: string },
    metric: 'sites' | 'assets' | 'tickets' | 'inspections',
    scope: TenantScope
  ): Promise<{ latitude: unknown; longitude: unknown; weight: unknown }[]> {
    const where = siteWhere(filters);
    const tenant = scopeSql(scope, 'l');
    const weight =
      metric === 'assets'
        ? Prisma.sql`COUNT(DISTINCT a.id)`
        : metric === 'tickets'
          ? Prisma.sql`COUNT(DISTINCT CASE WHEN t.status IN ('OPEN','ASSIGNED','IN_PROGRESS') THEN t.id END)`
          : metric === 'inspections'
            ? Prisma.sql`COUNT(DISTINCT i.id) + COUNT(DISTINCT r.id)`
            : Prisma.sql`1`;

    return prisma.$queryRaw`
      SELECT l.latitude, l.longitude, ${weight} AS weight
      FROM locations l
      LEFT JOIN assets      a ON a."locationId" = l.id AND a."deletedAt" IS NULL
      LEFT JOIN tickets     t ON t."locationId" = l.id AND t."deletedAt" IS NULL
      LEFT JOIN inspections i ON i."locationId" = l.id
      LEFT JOIN inspeksi_gardu_records r ON r."locationId" = l.id
      WHERE ${where} ${tenant}
      GROUP BY l.id, l.latitude, l.longitude
      HAVING ${weight} > 0
    ` as Promise<{ latitude: unknown; longitude: unknown; weight: unknown }[]>;
  }

  /**
   * Server-side grid clustering: snap every site to a `cellDeg`-sized grid cell
   * and return the per-cell count + centroid. Aggregation happens in PostgreSQL, so
   * the response size is bounded by the number of occupied cells — not the
   * number of sites. This keeps low-zoom "whole of Indonesia" views fast even
   * with hundreds of thousands of locations.
   */
  async gridClusters(
    filters: { bbox?: Bbox; type?: string; up3?: string },
    cellDeg: number,
    scope: TenantScope
  ): Promise<{ count: unknown; avgLat: unknown; avgLng: unknown }[]> {
    const where = siteWhere(filters);
    const tenant = scopeSql(scope, 'l');
    return prisma.$queryRaw`
      SELECT COUNT(*) AS count, AVG(l.latitude) AS "avgLat", AVG(l.longitude) AS "avgLng"
      FROM locations l
      WHERE ${where} ${tenant}
      GROUP BY ROUND(l.latitude / ${cellDeg}), ROUND(l.longitude / ${cellDeg})
    ` as Promise<{ count: unknown; avgLat: unknown; avgLng: unknown }[]>;
  }

  /** Per-layer counts for the layer catalog + overall bounding box. */
  async layerCounts(scope: TenantScope): Promise<{
    gardu: number;
    gi: number;
    gh: number;
    feeders: number;
    assets: number;
    inspections: number;
    openTickets: number;
    teams: number;
    bbox: [number, number, number, number] | null;
  }> {
    // Tenant predicates for the three locations contexts used below: bare
    // `locations`, joined `locations l`, and `teams` (own rtuppId column).
    const lt = scope.global ? Prisma.empty : Prisma.sql`AND "rtuppId" = ${scope.rtuppId}`;
    const lj = scope.global ? Prisma.empty : Prisma.sql`AND l."rtuppId" = ${scope.rtuppId}`;
    const tt = scope.global ? Prisma.empty : Prisma.sql`AND "rtuppId" = ${scope.rtuppId}`;
    const [rows, bboxRows] = await Promise.all([
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT
          (SELECT COUNT(*) FROM locations WHERE "deletedAt" IS NULL AND "locationType"='GARDU'
              AND latitude IS NOT NULL ${lt})                                 AS gardu,
          (SELECT COUNT(*) FROM locations WHERE "deletedAt" IS NULL AND "locationType"='GI'
              AND latitude IS NOT NULL ${lt})                                 AS gi,
          (SELECT COUNT(*) FROM locations WHERE "deletedAt" IS NULL AND "locationType"='GH'
              AND latitude IS NOT NULL ${lt})                                 AS gh,
          (SELECT COUNT(*) FROM feeders f JOIN locations l ON l.id=f."locationId"
              WHERE f."deletedAt" IS NULL AND l.latitude IS NOT NULL ${lj})   AS feeders,
          (SELECT COUNT(*) FROM assets a JOIN locations l ON l.id=a."locationId"
              WHERE a."deletedAt" IS NULL AND l.latitude IS NOT NULL ${lj})   AS assets,
          (SELECT COUNT(DISTINCT x."locationId") FROM (
              SELECT i."locationId" FROM inspections i
                JOIN locations l ON l.id=i."locationId" WHERE l.latitude IS NOT NULL ${lj}
              UNION
              SELECT r."locationId" FROM inspeksi_gardu_records r
                JOIN locations l ON l.id=r."locationId" WHERE l.latitude IS NOT NULL ${lj}
            ) x)                                                          AS inspections,
          (SELECT COUNT(*) FROM tickets t JOIN locations l ON l.id=t."locationId"
              WHERE t."deletedAt" IS NULL AND l.latitude IS NOT NULL
              AND t.status IN ('OPEN','ASSIGNED','IN_PROGRESS') ${lj})        AS "openTickets",
          (SELECT COUNT(*) FROM teams WHERE "isActive" = true ${tt})          AS teams
      `,
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT MIN(longitude) AS "minLng", MIN(latitude) AS "minLat",
               MAX(longitude) AS "maxLng", MAX(latitude) AS "maxLat"
        FROM locations WHERE "deletedAt" IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL ${lt}
      `,
    ]);
    const r = rows[0] ?? {};
    const b = bboxRows[0] ?? {};
    const bbox =
      b.minLng == null
        ? null
        : ([num(b.minLng), num(b.minLat), num(b.maxLng), num(b.maxLat)] as [
            number,
            number,
            number,
            number,
          ]);
    return {
      gardu: num(r.gardu),
      gi: num(r.gi),
      gh: num(r.gh),
      feeders: num(r.feeders),
      assets: num(r.assets),
      inspections: num(r.inspections),
      openTickets: num(r.openTickets),
      teams: num(r.teams),
      bbox,
    };
  }

  /**
   * Team last-known positions: each active team is placed at the location of its
   * most recent inspection (by any team member). Teams have no coordinate column
   * of their own, so this derives an operational footprint from existing data.
   */
  async teamPositions(scope: TenantScope): Promise<
    {
      teamId: string;
      teamName: string;
      teamCode: string | null;
      locationId: string;
      locationName: string;
      latitude: unknown;
      longitude: unknown;
      lastSeen: Date;
    }[]
  > {
    const tenant = scopeSql(scope, 'l');
    return prisma.$queryRaw`
      SELECT tm.id AS "teamId", tm.name AS "teamName", tm.code AS "teamCode",
             l.id AS "locationId", l.name AS "locationName", l.latitude, l.longitude,
             i."inspectionDate" AS "lastSeen"
      FROM inspections i
      JOIN users u    ON i."inspectorId" = u.id AND u."teamId" IS NOT NULL
      JOIN teams tm   ON tm.id = u."teamId" AND tm."isActive" = true
      JOIN locations l ON l.id = i."locationId" AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL ${tenant}
      WHERE i.id = (
        SELECT i2.id FROM inspections i2
        JOIN users u2 ON i2."inspectorId" = u2.id
        WHERE u2."teamId" = u."teamId"
        ORDER BY i2."inspectionDate" DESC, i2."createdAt" DESC
        LIMIT 1
      )
      GROUP BY tm.id, tm.name, tm.code, l.id, l.name, l.latitude, l.longitude, i."inspectionDate"
    ` as Promise<
      {
        teamId: string;
        teamName: string;
        teamCode: string | null;
        locationId: string;
        locationName: string;
        latitude: unknown;
        longitude: unknown;
        lastSeen: Date;
      }[]
    >;
  }

  /** Detail-popup aggregates for one site (uses the typed client — small, single row). */
  async siteDetail(id: string, scope: TenantScope) {
    return prisma.location.findFirst({
      where: { id, deletedAt: null, ...(scope.global ? {} : { rtuppId: scope.rtuppId }) },
      select: {
        id: true,
        code: true,
        name: true,
        locationType: true,
        up3: true,
        address: true,
        latitude: true,
        longitude: true,
        status: true,
        feeders: {
          where: { deletedAt: null },
          select: {
            id: true,
            feederCode: true,
            feederName: true,
            _count: { select: { assets: true } },
          },
        },
      },
    });
  }

  /** Asset breakdown by type for one site. */
  async assetBreakdown(locationId: string) {
    return prisma.$queryRaw<{ assetType: string; total: unknown; active: unknown; faulty: unknown }[]>`
      SELECT "assetType",
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
             COUNT(*) FILTER (WHERE status IN ('WARNING','DAMAGED')) AS faulty
      FROM assets WHERE "locationId" = ${locationId} AND "deletedAt" IS NULL
      GROUP BY "assetType"
      ORDER BY total DESC
    `;
  }

  /** Open work orders for one site. */
  async openTicketsFor(locationId: string) {
    return prisma.ticket.findMany({
      where: { locationId, deletedAt: null, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } },
      select: { id: true, ticketNumber: true, priority: true, status: true, openedAt: true },
      orderBy: [{ priority: 'desc' }, { openedAt: 'desc' }],
      take: 20,
    });
  }

  /** Most recent inspections (with worst finding status) for one site. */
  async recentInspectionsFor(locationId: string) {
    return prisma.$queryRaw<{ id: string; inspectionDate: Date; worstStatus: string | null }[]>`
      SELECT i.id, i."inspectionDate",
             MAX(CASE f.status WHEN 'CRITICAL' THEN 3 WHEN 'WARNING' THEN 2 WHEN 'NORMAL' THEN 1 END) AS sev,
             CASE MAX(CASE f.status WHEN 'CRITICAL' THEN 3 WHEN 'WARNING' THEN 2 WHEN 'NORMAL' THEN 1 END)
               WHEN 3 THEN 'CRITICAL' WHEN 2 THEN 'WARNING' WHEN 1 THEN 'NORMAL' ELSE NULL END AS "worstStatus"
      FROM inspections i
      LEFT JOIN inspection_findings f ON f."inspectionId" = i.id
      WHERE i."locationId" = ${locationId}
      GROUP BY i.id, i."inspectionDate"
      ORDER BY i."inspectionDate" DESC
      LIMIT 5
    `;
  }
}

export const gisRepository = new GisRepository();
