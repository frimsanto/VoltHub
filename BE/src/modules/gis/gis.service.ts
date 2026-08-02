import { gisRepository, GisRepository, SiteRow } from './gis.repository';
import { NotFoundError } from '../../utils/appError';
import type { TenantScope } from '../../utils/tenantScope';
import type { FeaturesQuery, HeatmapQuery, ClustersQuery, GisLayer } from './gis.validation';
import type {
  FeatureCollection,
  SiteFeatureProperties,
  SiteHealth,
  GeoFeature,
  TeamFeatureProperties,
  HeatmapResponse,
  ClustersResponse,
  LayerCatalog,
  SiteDetail,
} from './gis.dto';

/** Coerce a MySQL Decimal/BigInt/string to a JS number. */
const n = (v: unknown): number => {
  if (v == null) return 0;
  const x = Number(typeof v === 'bigint' ? v.toString() : String(v));
  return Number.isFinite(x) ? x : 0;
};

/**
 * Derive a site's operational health from its aggregates. Order matters —
 * the first matching, most-severe condition wins.
 */
const deriveHealth = (s: {
  active: number;
  criticalTickets: number;
  faultyAssetCount: number;
  openTickets: number;
}): SiteHealth => {
  if (!s.active) return 'OFFLINE';
  if (s.criticalTickets > 0 || s.faultyAssetCount > 0) return 'CRITICAL';
  if (s.openTickets > 0) return 'WARNING';
  return 'NORMAL';
};

/**
 * Tag a site with the operational layers it participates in. The map client
 * filters markers by these flags, so toggling a layer is instant (no re-fetch).
 */
const siteLayers = (s: SiteRow): string[] => {
  const out: string[] = [];
  if (s.locationType === 'GARDU' || s.locationType === 'GI' || s.locationType === 'GH') out.push('gardu');
  if (n(s.feederCount) > 0) out.push('penyulang');
  if (n(s.assetCount) > 0) out.push('asset');
  if (s.lastInspectionDate) out.push('inspection');
  if (n(s.openTickets) > 0) out.push('report');
  return out;
};

/**
 * GIS Service — assembles GeoJSON from the pre-aggregated repository rows.
 * Owns: health derivation, layer tagging, the bbox→zoom clustering policy, and
 * GeoJSON shaping. Coordinates are emitted in [lng, lat] order (RFC 7946).
 */
export class GisService {
  constructor(private readonly repo: GisRepository = gisRepository) {}

  /** Main map endpoint — the site substrate as a GeoJSON FeatureCollection. */
  async getFeatures(query: FeaturesQuery, scope: TenantScope): Promise<FeatureCollection<SiteFeatureProperties>> {
    const rows = await this.repo.findSites(
      { bbox: query.bbox, type: query.type, up3: query.up3, search: query.search, openTickets: query.openTickets },
      query.limit + 1, // fetch one extra to detect truncation
      scope
    );
    const truncated = rows.length > query.limit;
    const slice = truncated ? rows.slice(0, query.limit) : rows;
    const want = new Set<GisLayer>(query.layers);

    const features: GeoFeature<SiteFeatureProperties>[] = [];
    for (const r of slice) {
      const layers = siteLayers(r);
      // Keep a site only if it belongs to at least one requested layer.
      if (!layers.some((l) => want.has(l as GisLayer))) continue;
      const props: SiteFeatureProperties = {
        id: r.id,
        code: r.code,
        name: r.name,
        locationType: r.locationType as SiteFeatureProperties['locationType'],
        up3: r.up3,
        health: deriveHealth({
          active: n(r.active),
          criticalTickets: n(r.criticalTickets),
          faultyAssetCount: n(r.faultyAssetCount),
          openTickets: n(r.openTickets),
        }),
        assetCount: n(r.assetCount),
        activeAssetCount: n(r.activeAssetCount),
        faultyAssetCount: n(r.faultyAssetCount),
        feederCount: n(r.feederCount),
        openTickets: n(r.openTickets),
        criticalTickets: n(r.criticalTickets),
        lastInspectionDate: r.lastInspectionDate ? r.lastInspectionDate.toISOString() : null,
        layers,
      };
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [n(r.longitude), n(r.latitude)] },
        properties: props,
      });
    }

    return {
      type: 'FeatureCollection',
      features,
      meta: {
        count: features.length,
        truncated,
        layers: query.layers,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /** Team last-known positions as a GeoJSON FeatureCollection. */
  async getTeams(scope: TenantScope): Promise<FeatureCollection<TeamFeatureProperties>> {
    const rows = await this.repo.teamPositions(scope);
    const features: GeoFeature<TeamFeatureProperties>[] = rows.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [n(r.longitude), n(r.latitude)] },
      properties: {
        id: r.teamId,
        teamName: r.teamName,
        teamCode: r.teamCode,
        locationId: r.locationId,
        locationName: r.locationName,
        lastSeen: r.lastSeen.toISOString(),
      },
    }));
    return {
      type: 'FeatureCollection',
      features,
      meta: { count: features.length, truncated: false, layers: ['team'], generatedAt: new Date().toISOString() },
    };
  }

  /** Weighted heatmap points, normalized so the client can scale intensity. */
  async getHeatmap(query: HeatmapQuery, scope: TenantScope): Promise<HeatmapResponse> {
    const rows = await this.repo.heatPoints({ bbox: query.bbox, type: query.type, up3: query.up3 }, query.metric, scope);
    let max = 0;
    const points = rows.map((r) => {
      const w = n(r.weight);
      if (w > max) max = w;
      return [n(r.longitude), n(r.latitude), w] as [number, number, number];
    });
    return { metric: query.metric, max, points, generatedAt: new Date().toISOString() };
  }

  /**
   * Server-side clusters for low-zoom rendering. The grid cell size is derived
   * from the map zoom: each zoom step halves the cell, matching the Web-Mercator
   * tile pyramid so clusters stay visually consistent while panning/zooming.
   */
  async getClusters(query: ClustersQuery, scope: TenantScope): Promise<ClustersResponse> {
    // ~360° across the world at z0; halve per zoom level, then 4 sub-cells/tile.
    const cellDeg = Math.max(0.0005, 360 / 2 ** query.zoom / 4);
    const rows = await this.repo.gridClusters({ bbox: query.bbox, type: query.type, up3: query.up3 }, cellDeg, scope);
    const clusters = rows.map((r) => ({
      coordinates: [n(r.avgLng), n(r.avgLat)] as [number, number],
      count: n(r.count),
    }));
    return { zoom: query.zoom, cellDeg, clusters, generatedAt: new Date().toISOString() };
  }

  /** Layer catalog with live counts — drives the layer-control panel + counts. */
  async getLayers(scope: TenantScope): Promise<LayerCatalog> {
    const c = await this.repo.layerCounts(scope);
    return {
      layers: [
        { id: 'gardu', label: 'Gardu', geometry: 'point', count: c.gardu + c.gi + c.gh },
        { id: 'penyulang', label: 'Penyulang', geometry: 'point', count: c.feeders },
        { id: 'asset', label: 'Asset', geometry: 'point', count: c.assets },
        { id: 'inspection', label: 'Inspection', geometry: 'point', count: c.inspections },
        { id: 'report', label: 'Work Order', geometry: 'point', count: c.openTickets },
        { id: 'team', label: 'Team Location', geometry: 'point', count: c.teams },
      ],
      bbox: c.bbox,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Detail-popup payload for one site. */
  async getSiteDetail(id: string, scope: TenantScope): Promise<SiteDetail> {
    const loc = await this.repo.siteDetail(id, scope);
    if (!loc) throw new NotFoundError('Location not found');

    const [breakdown, tickets, inspections] = await Promise.all([
      this.repo.assetBreakdown(id),
      this.repo.openTicketsFor(id),
      this.repo.recentInspectionsFor(id),
    ]);

    const faulty = breakdown.reduce((acc, b) => acc + n(b.faulty), 0);
    const criticalTicket = tickets.some((t) => t.priority === 'CRITICAL');
    const health = deriveHealth({
      active: loc.status ? 1 : 0,
      criticalTickets: criticalTicket ? 1 : 0,
      faultyAssetCount: faulty,
      openTickets: tickets.length,
    });

    return {
      id: loc.id,
      code: loc.code,
      name: loc.name,
      locationType: loc.locationType as SiteDetail['locationType'],
      up3: loc.up3,
      address: loc.address,
      coordinates:
        loc.latitude != null && loc.longitude != null
          ? [Number(loc.longitude), Number(loc.latitude)]
          : null,
      health,
      feeders: loc.feeders.map((f) => ({
        id: f.id,
        feederCode: f.feederCode,
        feederName: f.feederName,
        assetCount: f._count.assets,
      })),
      assetsByType: breakdown.map((b) => ({
        assetType: b.assetType,
        total: n(b.total),
        active: n(b.active),
        faulty: n(b.faulty),
      })),
      openTickets: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        priority: t.priority,
        status: t.status,
        openedAt: t.openedAt ? t.openedAt.toISOString() : null,
      })),
      recentInspections: inspections.map((i) => ({
        id: i.id,
        inspectionDate: i.inspectionDate.toISOString(),
        worstStatus: i.worstStatus,
      })),
    };
  }
}

export const gisService = new GisService();
