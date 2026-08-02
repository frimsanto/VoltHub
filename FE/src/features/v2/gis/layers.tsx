// Imperative Leaflet plugin layers (marker clustering + heatmap) driven from
// React props. react-leaflet has no first-class wrapper for these plugins, so
// each component grabs the map via `useMap()` and manages a single plugin layer
// across its lifecycle. This keeps clustering/heat working regardless of the
// react-leaflet version and avoids per-marker React reconciliation cost.
import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.heat";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { GeoFeature, GisLayerId, SiteFeatureProperties, TeamFeatureProperties } from "./api";
import { siteIcon, layerColor, teamIcon, clusterIcon } from "./style";
import { locationLabel } from "@/lib/utils";

// ── Client-side marker clustering for the visible site features ────────────────
export function SiteClusterLayer({
  features,
  activeLayers,
  onSelect,
}: {
  features: GeoFeature<SiteFeatureProperties>[];
  activeLayers: Set<GisLayerId>;
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    const group = L.markerClusterGroup({
      chunkedLoading: true, // add markers in chunks → no UI freeze on large sets
      maxClusterRadius: 60,
      iconCreateFunction: (cluster) => clusterIcon(cluster.getChildCount()),
    });
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    const markers = features.map((f) => {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const emphasized = p.openTickets > 0 || p.health === "CRITICAL";
      const color = layerColor(p.layers, activeLayers);
      const marker = L.marker([lat, lng], { icon: siteIcon(color, emphasized) });
      marker.bindTooltip(locationLabel(p.code, p.name), { direction: "top", offset: [0, -8] });
      marker.on("click", () => onSelect(p.id));
      return marker;
    });
    group.addLayers(markers);
  }, [features, activeLayers, onSelect]);

  return null;
}

// ── Heatmap layer (density of the chosen metric) ───────────────────────────────
export function HeatLayer({
  points,
  max,
}: {
  points: [number, number, number][]; // [lng, lat, weight]
  max: number;
}) {
  const map = useMap();
  const layerRef = useRef<L.HeatLayer | null>(null);

  useEffect(() => {
    // leaflet.heat expects [lat, lng, intensity]; our API sends [lng, lat, w].
    const latlngs = points.map(([lng, lat, w]) => [lat, lng, w] as [number, number, number]);
    const layer = L.heatLayer(latlngs, {
      radius: 25,
      blur: 18,
      max: Math.max(1, max),
      minOpacity: 0.25,
    });
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, points, max]);

  return null;
}

// ── Team last-known-position markers (no clustering — few, always visible) ─────
export function TeamLayer({
  features,
  onSelect,
}: {
  features: GeoFeature<TeamFeatureProperties>[];
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    groupRef.current = group;
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    for (const f of features) {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const marker = L.marker([lat, lng], { icon: teamIcon() });
      marker.bindTooltip(`${p.teamName} · ${p.locationName}`, { direction: "top", offset: [0, -10] });
      marker.on("click", () => onSelect(p.locationId));
      group.addLayer(marker);
    }
  }, [features, onSelect]);

  return null;
}

// ── Server-side grid clusters (low-zoom rendering of very large datasets) ──────
// At low zoom we never download individual sites — the backend aggregates them
// into grid buckets, so the payload is bounded by occupied cells, not site count.
export function GridClusterLayer({
  clusters,
  onZoomTo,
}: {
  clusters: { coordinates: [number, number]; count: number }[];
  onZoomTo: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    groupRef.current = group;
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    for (const c of clusters) {
      const [lng, lat] = c.coordinates;
      const marker = L.marker([lat, lng], { icon: clusterIcon(c.count) });
      marker.on("click", () => onZoomTo(lat, lng));
      group.addLayer(marker);
    }
  }, [clusters, onZoomTo]);

  return null;
}

// ── Viewport reporter: emits the current bbox (debounced) on pan/zoom ──────────
export function ViewportWatcher({
  onChange,
}: {
  onChange: (bbox: string, zoom: number) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emit = (map: L.Map) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const b = map.getBounds();
      const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
        .map((n) => n.toFixed(5))
        .join(",");
      onChange(bbox, map.getZoom());
    }, 300);
  };
  const map = useMapEvents({
    moveend: () => emit(map),
    zoomend: () => emit(map),
  });
  // Emit once on mount so the first fetch matches the initial view.
  useEffect(() => {
    emit(map);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
