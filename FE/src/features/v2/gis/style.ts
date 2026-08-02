// GIS visual vocabulary — health colors, layer metadata, and marker factories.
// Uses Leaflet divIcons (CSS circles) instead of image markers, so there are no
// external marker-image assets to bundle and health/severity is shown by color.
import L from "leaflet";
import type { SiteHealth, GisLayerId } from "./api";

/** Operational health → marker color (aligns with the app status palette). */
export const HEALTH_COLOR: Record<SiteHealth, string> = {
  NORMAL: "#16a34a", // green
  WARNING: "#f59e0b", // amber
  CRITICAL: "#dc2626", // red
  OFFLINE: "#6b7280", // gray
};

export const HEALTH_LABEL: Record<SiteHealth, string> = {
  NORMAL: "Normal",
  WARNING: "Perlu Perhatian",
  CRITICAL: "Kritis",
  OFFLINE: "Offline",
};

export interface LayerMeta {
  id: GisLayerId;
  label: string;
  /** Tailwind text color for the legend chip. */
  color: string;
  defaultOn: boolean;
}

/** The toggleable layers shown in the control panel (order = render order). */
export const LAYER_META: LayerMeta[] = [
  { id: "gardu", label: "Gardu", color: "#2563eb", defaultOn: true },
  { id: "penyulang", label: "Penyulang", color: "#7c3aed", defaultOn: false },
  { id: "asset", label: "Asset", color: "#0891b2", defaultOn: false },
  { id: "inspection", label: "Inspection", color: "#0d9488", defaultOn: false },
  { id: "report", label: "Work Order", color: "#dc2626", defaultOn: true },
  { id: "team", label: "Team Location", color: "#ea580c", defaultOn: false },
];

// Marker color follows the LAYER legend, not health. A site can belong to
// several layers at once, so we color it by its most-specific ACTIVE layer
// (work order → inspection → asset → penyulang → gardu). Team is rendered
// separately. This keeps the pin color matching the toggles shown in the panel.
const COLOR_PRIORITY: GisLayerId[] = ["report", "inspection", "asset", "penyulang", "gardu"];

/** Pick a site's marker color from the highest-priority active layer it has. */
export function layerColor(featureLayers: string[], active: Set<GisLayerId>): string {
  const colorOf = (id: GisLayerId) => LAYER_META.find((m) => m.id === id)?.color ?? "#6b7280";
  for (const id of COLOR_PRIORITY) {
    if (active.has(id) && featureLayers.includes(id)) return colorOf(id);
  }
  // Fallback (shouldn't normally hit — the site only renders if a layer matched).
  const first = COLOR_PRIORITY.find((id) => featureLayers.includes(id));
  return first ? colorOf(first) : "#6b7280";
}

/** A colored circle marker for a site, sized slightly up when it has open work. */
export function siteIcon(color: string, emphasized: boolean): L.DivIcon {
  const size = emphasized ? 18 : 14;
  return L.divIcon({
    className: "gis-site-marker",
    html: `<span style="
      display:block;width:${size}px;height:${size}px;border-radius:9999px;
      background:${color};border:2px solid #fff;
      box-shadow:0 0 0 1px rgba(0,0,0,.25),0 1px 3px rgba(0,0,0,.4);"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** A distinct teardrop-ish marker for team last-known positions. */
export function teamIcon(): L.DivIcon {
  return L.divIcon({
    className: "gis-team-marker",
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:22px;height:22px;border-radius:9999px;
      background:${LAYER_META.find((l) => l.id === "team")!.color};
      border:2px solid #fff;color:#fff;font-size:12px;font-weight:700;
      box-shadow:0 1px 4px rgba(0,0,0,.45);">◎</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/** Cluster bubble used by the server-side (low-zoom) cluster layer. */
export function clusterIcon(count: number): L.DivIcon {
  const size = count < 100 ? 36 : count < 1000 ? 44 : 52;
  return L.divIcon({
    className: "gis-grid-cluster",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:9999px;
      display:flex;align-items:center;justify-content:center;
      background:rgba(37,99,235,.85);color:#fff;font-weight:700;font-size:13px;
      border:3px solid rgba(255,255,255,.85);box-shadow:0 2px 6px rgba(0,0,0,.4);">
      ${count >= 1000 ? `${Math.round(count / 100) / 10}k` : count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
