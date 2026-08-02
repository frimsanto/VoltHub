/**
 * GIS DTOs — GeoJSON-compatible response contracts.
 *
 * Output is RFC 7946 GeoJSON so the map client can hand features straight to
 * Leaflet / Mapbox / any GIS tool without a translation layer. Coordinates are
 * always `[longitude, latitude]` (GeoJSON order), NOT `[lat, lng]`.
 */

export type SiteHealth = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OFFLINE';
export type LocationType = 'GI' | 'GH' | 'GARDU';

/** Properties carried by every site (location-anchored) feature. */
export interface SiteFeatureProperties {
  id: string;
  code: string;
  name: string;
  locationType: LocationType;
  up3: string | null;
  health: SiteHealth;
  /** Per-layer aggregates — let the client toggle layers without re-fetching. */
  assetCount: number;
  activeAssetCount: number;
  faultyAssetCount: number;
  feederCount: number;
  openTickets: number;
  criticalTickets: number;
  lastInspectionDate: string | null;
  /** Layer membership flags (drives client-side layer filtering). */
  layers: string[];
}

export interface GeoFeature<P> {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: P;
}

export interface FeatureCollection<P> {
  type: 'FeatureCollection';
  features: GeoFeature<P>[];
  /** Non-standard metadata block (ignored by strict GeoJSON parsers). */
  meta: {
    count: number;
    truncated: boolean;
    layers: string[];
    generatedAt: string;
  };
}

export interface TeamFeatureProperties {
  id: string;
  teamName: string;
  teamCode: string | null;
  /** Last-known operational position (latest inspection by a team member). */
  locationId: string;
  locationName: string;
  lastSeen: string;
}

/** A weighted point for the heatmap layer: [lng, lat, intensity]. */
export type HeatPoint = [number, number, number];

export interface HeatmapResponse {
  metric: string;
  max: number;
  points: HeatPoint[];
  generatedAt: string;
}

/** A server-side cluster (grid bucket) for low-zoom rendering of huge datasets. */
export interface ClusterPoint {
  /** Cluster centroid. */
  coordinates: [number, number];
  count: number;
}

export interface ClustersResponse {
  zoom: number;
  cellDeg: number;
  clusters: ClusterPoint[];
  generatedAt: string;
}

export interface LayerCatalogEntry {
  id: string;
  label: string;
  geometry: 'point' | 'line' | 'polygon';
  count: number;
}

export interface LayerCatalog {
  layers: LayerCatalogEntry[];
  /** Bounding box of all geocoded sites: [minLng, minLat, maxLng, maxLat]. */
  bbox: [number, number, number, number] | null;
  generatedAt: string;
}

/** Detail-popup payload for one site (the map info window). */
export interface SiteDetail {
  id: string;
  code: string;
  name: string;
  locationType: LocationType;
  up3: string | null;
  address: string | null;
  coordinates: [number, number] | null;
  health: SiteHealth;
  feeders: { id: string; feederCode: string; feederName: string; assetCount: number }[];
  assetsByType: { assetType: string; total: number; active: number; faulty: number }[];
  openTickets: {
    id: string;
    ticketNumber: string;
    priority: string;
    status: string;
    openedAt: string | null;
  }[];
  recentInspections: { id: string; inspectionDate: string; worstStatus: string | null }[];
}
