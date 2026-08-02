import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LatLngBoundsExpression } from "leaflet";
import { Map as MapIcon } from "lucide-react";
import { PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/route-guards";
import { GisMap } from "@/features/v2/gis/GisMap";
import { GisLayerControl } from "@/features/v2/gis/GisLayerControl";
import { GisMobileControls } from "@/features/v2/gis/GisMobileControls";
import { GisMobileSummaryBar } from "@/features/v2/gis/GisMobileSummaryBar";
import { useGisLayers, type GisLayerId } from "@/features/v2/gis/api";
import { LAYER_META } from "@/features/v2/gis/style";
import { useV2Role } from "@/lib/v2/rbac";

export const Route = createFileRoute("/_app/gis")({
  beforeLoad: () => {
    // PETUGAS included: read-only map so field officers can find an assigned gardu.
    // NOC included: control-room monitoring surface (read-only, global scope).
    requireRole(["admin", "superadmin", "petugas", "noc"]);
  },
  component: GisMonitoring,
  head: () => ({ meta: [{ title: "GIS Monitoring — VoltHub" }] }),
});

const DEFAULT_LAYERS = new Set<GisLayerId>(LAYER_META.filter((l) => l.defaultOn).map((l) => l.id));

function GisMonitoring() {
  const { data: catalog } = useGisLayers();
  const role = useV2Role();

  const [activeLayers, setActiveLayers] = useState<Set<GisLayerId>>(DEFAULT_LAYERS);
  const [heatmapOn, setHeatmapOn] = useState(false);
  const [heatmapMetric, setHeatmapMetric] = useState("tickets");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"GI" | "GH" | "GARDU" | undefined>(undefined);
  const [openTickets, setOpenTickets] = useState(false);
  const [up3, setUp3] = useState<string | undefined>(undefined);
  // Wilayah (UP3) options accumulate from the real sites the map loads — there is
  // no dedicated regions endpoint, so we union what we discover (never shrinks as
  // the user pans, so the dropdown stays stable).
  const [regionOptions, setRegionOptions] = useState<string[]>([]);
  const handleRegions = useCallback((regions: string[]) => {
    setRegionOptions((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const r of regions)
        if (!next.has(r)) {
          next.add(r);
          changed = true;
        }
      return changed ? Array.from(next).sort((a, b) => a.localeCompare(b)) : prev;
    });
  }, []);

  // Debounce search so typing doesn't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fit the map to all geocoded sites once the catalog (with bbox) loads.
  const fitBounds = useMemo<LatLngBoundsExpression | null>(() => {
    const b = catalog?.bbox;
    if (!b) return null;
    const [minLng, minLat, maxLng, maxLat] = b;
    return [
      [minLat, minLng],
      [maxLat, maxLng],
    ];
  }, [catalog?.bbox]);

  const toggleLayer = (id: GisLayerId) =>
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const controlProps = {
    catalog,
    activeLayers,
    onToggleLayer: toggleLayer,
    heatmapOn,
    onToggleHeatmap: setHeatmapOn,
    heatmapMetric,
    onHeatmapMetric: setHeatmapMetric,
    search: searchInput,
    onSearch: setSearchInput,
    type,
    onType: setType,
    openTickets,
    onOpenTickets: setOpenTickets,
    up3,
    onUp3: setUp3,
    regionOptions,
  };

  return (
    <div>
      {/* Desktop/tablet keep the page header; phones go fullscreen-map so the map
          is the primary focus (ArcGIS Field Maps / Google Maps pattern). */}
      <div className="hidden md:block">
        <PageHeader
          title="GIS Monitoring"
          description="Visualisasi aset operasional pada peta — gardu, penyulang, work order, inspeksi, dan posisi tim."
          actions={
            <Badge className="gap-1.5 border border-success/30 bg-success/15 text-success">
              <MapIcon className="size-3.5" /> Peta Operasional
            </Badge>
          }
        />
      </div>

      {/* Map surface.
          Phones: a FIXED, full-bleed overlay from the top bar to the screen edge
          (z-0) so the map is map-first and the tab bar floats over it — when the
          nav auto-hides during pan/zoom there's no reflow (no layout jump).
          md+: an enterprise command-center split — a docked 25% control panel
          (search · layers · filters · statistics) on the left and a 75% map on
          the right, so desktop users never lose map visibility behind a floating
          card or bottom sheet. A single GisMap instance is shared by both
          layouts. */}
      <div className="fixed inset-x-0 bottom-0 top-(--topbar-h) z-0 md:relative md:inset-auto md:top-auto md:z-auto md:mt-4 md:grid md:h-[calc(100vh-12rem)] md:grid-cols-[minmax(280px,25%)_1fr] md:gap-4">
        {/* Desktop docked control panel — first column, hidden on phones. */}
        <div className="hidden overflow-hidden rounded-2xl border border-border/60 md:block">
          <GisLayerControl {...controlProps} docked />
        </div>

        {/* Map — phones: fills the fixed overlay; desktop: the 70% second column. */}
        <div className="relative h-full">
          <GisMap
            className="rounded-none border-0 md:rounded-2xl md:border md:border-border/60"
            onRegions={handleRegions}
            state={{
              activeLayers,
              heatmapOn,
              heatmapMetric,
              search: search || undefined,
              type,
              up3,
              openTickets: openTickets || undefined,
              fitBounds,
            }}
          />

          {/* Phone floating search + Layers/Filter buttons + bottom sheets. */}
          <div className="md:hidden">
            <GisMobileControls {...controlProps} />
          </div>

          {/* Always-visible summary strip above the bottom nav (Screen 10),
              PETUGAS phones only. */}
          {role === "PETUGAS" && (
            <div className="md:hidden">
              <GisMobileSummaryBar />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
