// VoltHub — GIS Monitoring data layer.
//
// Talks to the backend GIS module (BE/src/modules/gis, mounted at
// `/api/v1/gis`). Every spatial response is RFC 7946 GeoJSON with coordinates in
// [lng, lat] order, so payloads hand straight to Leaflet. See docs/GIS_MODULE.md.
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { v2Get, v2Patch } from "@/lib/api/v2";

// ── Response contracts (mirror BE/src/modules/gis/gis.dto.ts) ──────────────────
export type SiteHealth = "NORMAL" | "WARNING" | "CRITICAL" | "OFFLINE";
export type GisLayerId = "gardu" | "penyulang" | "asset" | "inspection" | "report" | "team";

export interface SiteFeatureProperties {
  id: string;
  code: string;
  name: string;
  locationType: "GI" | "GH" | "GARDU";
  up3: string | null;
  health: SiteHealth;
  assetCount: number;
  activeAssetCount: number;
  faultyAssetCount: number;
  feederCount: number;
  openTickets: number;
  criticalTickets: number;
  lastInspectionDate: string | null;
  layers: string[];
}

export interface TeamFeatureProperties {
  id: string;
  teamName: string;
  teamCode: string | null;
  locationId: string;
  locationName: string;
  lastSeen: string;
}

export interface GeoFeature<P> {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: P;
}

export interface FeatureCollection<P> {
  type: "FeatureCollection";
  features: GeoFeature<P>[];
  meta: { count: number; truncated: boolean; layers: string[]; generatedAt: string };
}

export interface HeatmapResponse {
  metric: string;
  max: number;
  points: [number, number, number][]; // [lng, lat, weight]
  generatedAt: string;
}

export interface ClustersResponse {
  zoom: number;
  cellDeg: number;
  clusters: { coordinates: [number, number]; count: number }[];
  generatedAt: string;
}

export interface LayerCatalog {
  layers: { id: GisLayerId; label: string; geometry: string; count: number }[];
  bbox: [number, number, number, number] | null;
  generatedAt: string;
}

export interface SiteDetail {
  id: string;
  code: string;
  name: string;
  locationType: "GI" | "GH" | "GARDU";
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

export interface FeaturesParams {
  /** Viewport "minLng,minLat,maxLng,maxLat" — only on-screen sites are fetched. */
  bbox?: string;
  /** Comma list of layer ids, e.g. "gardu,report". */
  layers?: string;
  type?: "GI" | "GH" | "GARDU";
  up3?: string;
  search?: string;
  openTickets?: boolean;
  limit?: number;
}

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== "" && v !== false));

const keys = {
  layers: ["gis", "layers"] as const,
  features: (p: FeaturesParams) => ["gis", "features", p] as const,
  teams: ["gis", "teams"] as const,
  heatmap: (p: Record<string, unknown>) => ["gis", "heatmap", p] as const,
  clusters: (p: Record<string, unknown>) => ["gis", "clusters", p] as const,
  detail: (id: string) => ["gis", "detail", id] as const,
};

/** Layer catalog + live counts + overall bounding box (for initial fit). */
export function useGisLayers() {
  return useQuery<LayerCatalog>({
    queryKey: keys.layers,
    queryFn: () => v2Get<LayerCatalog>("/gis/layers"),
    staleTime: 60_000,
  });
}

/**
 * Site substrate for the current viewport. `keepPreviousData` keeps the old
 * markers on screen while panning fetches the next bbox (no flicker).
 */
export function useGisFeatures(params: FeaturesParams, enabled = true) {
  return useQuery<FeatureCollection<SiteFeatureProperties>>({
    queryKey: keys.features(params),
    queryFn: () =>
      v2Get<FeatureCollection<SiteFeatureProperties>>("/gis/features", {
        params: clean(params as Record<string, unknown>),
      }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useGisTeams(enabled = true) {
  return useQuery<FeatureCollection<TeamFeatureProperties>>({
    queryKey: keys.teams,
    queryFn: () => v2Get<FeatureCollection<TeamFeatureProperties>>("/gis/teams"),
    enabled,
    staleTime: 30_000,
  });
}

export function useGisHeatmap(
  params: { bbox?: string; type?: string; up3?: string; metric?: string },
  enabled = true,
) {
  return useQuery<HeatmapResponse>({
    queryKey: keys.heatmap(params),
    queryFn: () =>
      v2Get<HeatmapResponse>("/gis/heatmap", { params: clean(params as Record<string, unknown>) }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useGisClusters(
  params: { bbox?: string; zoom?: number; type?: string; up3?: string },
  enabled = true,
) {
  return useQuery<ClustersResponse>({
    queryKey: keys.clusters(params),
    queryFn: () =>
      v2Get<ClustersResponse>("/gis/clusters", { params: clean(params as Record<string, unknown>) }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/** Detail-popup payload for one site. Lazily fetched when a marker is opened. */
export function useGisSiteDetail(id: string | null) {
  return useQuery<SiteDetail>({
    queryKey: keys.detail(id ?? ""),
    queryFn: () => v2Get<SiteDetail>(`/gis/locations/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ── Field geo-verification (PETUGAS) ───────────────────────────────────────────
// Hits the Locations write surface (PATCH /api/v1/locations/:id/coordinates), not
// the read-only GIS module. `CONFIRMED` = lokasi sesuai (no change, just logged);
// `CORRECTED` = tidak sesuai → new coordinates persisted and the map auto-updates.
export interface VerifyCoordinatesBody {
  result: "CONFIRMED" | "CORRECTED";
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  note?: string | null;
}

/**
 * Verify / correct a gardu's coordinates from the field. On success the site
 * detail and the marker substrate are invalidated so the pin jumps to its new
 * (corrected) position without a manual refresh.
 */
export function useVerifySiteCoordinates(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VerifyCoordinatesBody) =>
      v2Patch<SiteDetail, VerifyCoordinatesBody>(`/locations/${id}/coordinates`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.detail(id) });
      qc.invalidateQueries({ queryKey: ["gis", "features"] });
      qc.invalidateQueries({ queryKey: keys.layers });
    },
  });
}
