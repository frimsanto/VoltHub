// GisMap — the interactive map surface. Owns the viewport (bbox/zoom), fetches
// only what's on screen, and renders the active layers. Below a zoom threshold
// it switches from individual markers to server-side grid clusters so the map
// stays fast over very large datasets (see docs/GIS_MODULE.md).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap, AttributionControl } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { cn } from "@/lib/utils";
import {
  SiteClusterLayer,
  HeatLayer,
  TeamLayer,
  GridClusterLayer,
  ViewportWatcher,
} from "./layers";
import { SiteDetailPanel } from "./SiteDetailPanel";
import { useGisFeatures, useGisTeams, useGisHeatmap, useGisClusters, type GisLayerId } from "./api";
import { useMobileNavStore } from "@/stores/mobileNav";

/** Below this zoom, use server-side grid clusters instead of per-site markers. */
const CLUSTER_ZOOM_THRESHOLD = 7;

/** Default view: Java (covers the bulk of PLN UP3 coverage). Fitted to data later. */
const DEFAULT_CENTER: [number, number] = [-7.5, 110.0];
const DEFAULT_ZOOM = 7;

export interface GisMapState {
  activeLayers: Set<GisLayerId>;
  heatmapOn: boolean;
  heatmapMetric: string;
  search?: string;
  type?: "GI" | "GH" | "GARDU";
  /** Wilayah (UP3) filter — restricts sites/clusters/heatmap to one region. */
  up3?: string;
  /** Status filter: only sites with active work orders. */
  openTickets?: boolean;
  fitBounds?: LatLngBoundsExpression | null;
}

/** Imperatively fit/zoom the map when asked (initial fit + cluster drill-in). */
function MapController({
  fitBounds,
  flyTo,
}: {
  fitBounds?: LatLngBoundsExpression | null;
  flyTo: { lat: number; lng: number; key: number; zoom?: number } | null;
}) {
  const map = useMap();
  useMemo(() => {
    if (fitBounds) map.fitBounds(fitBounds, { padding: [40, 40], maxZoom: 12 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitBounds]);
  useMemo(() => {
    if (flyTo) map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom ?? Math.min(map.getZoom() + 3, 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.key]);
  return null;
}

/** Auto-hide the mobile bottom tab bar while the user drives the map (pan/zoom),
 *  bringing it back shortly after gestures stop. Map-first feel à la Google Maps.
 *  A short mount grace period ignores the programmatic initial fit/fly so the bar
 *  doesn't flash on load. Restores the bar on unmount (leaving the page). */
function MapAutoHideNav() {
  const map = useMap();
  const setHidden = useMobileNavStore((s) => s.setHidden);
  useEffect(() => {
    const mountedAt = Date.now();
    let restoreTimer: number | undefined;

    const hide = () => {
      if (Date.now() - mountedAt < 1200) return; // ignore the initial fit/fly
      window.clearTimeout(restoreTimer);
      setHidden(true);
    };
    const scheduleShow = () => {
      window.clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(() => setHidden(false), 900);
    };

    map.on("dragstart", hide);
    map.on("zoomstart", hide);
    map.on("moveend", scheduleShow);
    map.on("zoomend", scheduleShow);
    return () => {
      window.clearTimeout(restoreTimer);
      map.off("dragstart", hide);
      map.off("zoomstart", hide);
      map.off("moveend", scheduleShow);
      map.off("zoomend", scheduleShow);
      setHidden(false); // never leave the bar hidden after navigating away
    };
  }, [map, setHidden]);
  return null;
}

/** Keep Leaflet's internal size in sync with the container. The map mounts inside
 *  a fixed full-bleed overlay whose final height is only known after layout (CSS
 *  vars / safe-area), so without this Leaflet measures too small and only paints
 *  tiles for the top slice (rest stays grey). Invalidate after mount and on any
 *  container resize / orientation change. */
function MapSizeSync() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const t = window.setTimeout(fix, 150);
    const ro = new ResizeObserver(fix);
    ro.observe(map.getContainer());
    window.addEventListener("orientationchange", fix);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      window.removeEventListener("orientationchange", fix);
    };
  }, [map]);
  return null;
}

export function GisMap({
  state,
  className,
  onRegions,
}: {
  state: GisMapState;
  className?: string;
  /** Reports the distinct UP3 regions seen in the loaded sites (for the Wilayah
   *  filter options). Pass a stable (memoised) callback. */
  onRegions?: (regions: string[]) => void;
}) {
  const [bbox, setBbox] = useState<string | undefined>();
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{
    lat: number;
    lng: number;
    key: number;
    zoom?: number;
  } | null>(null);

  const onViewport = useCallback((b: string, z: number) => {
    setBbox(b);
    setZoom(z);
  }, []);

  const useClusters = zoom < CLUSTER_ZOOM_THRESHOLD;
  const siteLayers = useMemo(
    () => [...state.activeLayers].filter((l) => l !== "team"),
    [state.activeLayers],
  );
  const wantSites = siteLayers.length > 0;
  const wantTeam = state.activeLayers.has("team");

  // Individual site features — only when zoomed in past the cluster threshold.
  const featuresQ = useGisFeatures(
    {
      bbox,
      layers: siteLayers.join(","),
      type: state.type,
      up3: state.up3,
      openTickets: state.openTickets,
      search: state.search,
      limit: 2000,
    },
    wantSites && !useClusters && !!bbox,
  );

  // Server-side grid clusters — only at low zoom.
  const clustersQ = useGisClusters(
    { bbox, zoom, type: state.type, up3: state.up3 },
    wantSites && useClusters && !!bbox,
  );

  const teamsQ = useGisTeams(wantTeam);

  const heatQ = useGisHeatmap(
    { bbox, type: state.type, up3: state.up3, metric: state.heatmapMetric },
    state.heatmapOn && !!bbox,
  );

  // Surface the distinct regions present in the loaded sites so the page can build
  // the Wilayah (UP3) filter from real data (no dedicated regions endpoint).
  useEffect(() => {
    if (!onRegions || !featuresQ.data) return;
    const regions = Array.from(
      new Set(featuresQ.data.features.map((f) => f.properties.up3).filter((u): u is string => !!u)),
    );
    if (regions.length) onRegions(regions);
  }, [featuresQ.data, onRegions]);

  const flyToCluster = useCallback(
    (lat: number, lng: number) => setFlyTo({ lat, lng, key: Date.now() }),
    [],
  );

  // ── Search → jump straight to the gardu ──────────────────────────────────
  // The viewport-bound `featuresQ` only sees what's on screen, so a searched
  // gardu off-screen would never be found. This separate query searches the
  // whole dataset (no bbox); when it returns we fly to the top match, zoom in,
  // and open its detail panel (which has the "Buka di Google Maps" action).
  const searchQ = useGisFeatures(
    { layers: siteLayers.join(","), type: state.type, search: state.search, limit: 10 },
    wantSites && !!state.search,
  );
  const lastFlownRef = useRef<string>("");
  useEffect(() => {
    if (!state.search) {
      lastFlownRef.current = "";
      return;
    }
    const f = searchQ.data?.features?.[0];
    if (!f) return;
    const key = `${state.search}:${f.properties.id}`;
    if (lastFlownRef.current === key) return; // already jumped to this match
    lastFlownRef.current = key;
    const [lng, lat] = f.geometry.coordinates;
    setFlyTo({ lat, lng, key: Date.now(), zoom: 17 });
    setSelectedId(f.properties.id);
  }, [state.search, searchQ.data]);

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-2xl border border-border/60",
        className,
      )}
    >
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        preferCanvas
        attributionControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* Minimal OSM credit (license requires it) — no "Leaflet" prefix/flag. */}
        <AttributionControl position="bottomright" prefix={false} />

        <ViewportWatcher onChange={onViewport} />
        <MapController fitBounds={state.fitBounds} flyTo={flyTo} />
        <MapAutoHideNav />
        <MapSizeSync />

        {state.heatmapOn && heatQ.data && (
          <HeatLayer points={heatQ.data.points} max={heatQ.data.max} />
        )}

        {wantSites && useClusters && clustersQ.data && (
          <GridClusterLayer clusters={clustersQ.data.clusters} onZoomTo={flyToCluster} />
        )}

        {wantSites && !useClusters && featuresQ.data && (
          <SiteClusterLayer
            features={featuresQ.data.features}
            activeLayers={state.activeLayers}
            onSelect={setSelectedId}
          />
        )}

        {wantTeam && teamsQ.data && (
          <TeamLayer features={teamsQ.data.features} onSelect={setSelectedId} />
        )}
      </MapContainer>

      {/* Truncation / count hint — lifted above the mobile tab bar (nav-h is 0 on
          desktop, so this resolves to a normal bottom inset there). */}
      <div className="absolute bottom-[calc(var(--bottomnav-h)+0.5rem)] left-2 z-[1000] rounded-md bg-card/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
        {useClusters
          ? `${clustersQ.data?.clusters.length ?? 0} klaster · zoom in untuk detail`
          : `${featuresQ.data?.meta.count ?? 0} lokasi${featuresQ.data?.meta.truncated ? " (terpotong — perkecil filter)" : ""}`}
      </div>

      {selectedId && <SiteDetailPanel id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
