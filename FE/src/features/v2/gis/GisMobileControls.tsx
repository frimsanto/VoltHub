// GisMobileControls — native-style map chrome for phones (ArcGIS Field Maps /
// Google Maps pattern). The map stays the primary focus; controls float over it:
//   • a compact search pill (top)
//   • a button stack (bottom-right): Layers + Filter
//   • two bottom sheets (vaul) for Layers and Filter
// Fully controlled by the GIS page so URL/state stays the single source of truth.
// Rendered only on phones (<md); md+ keeps the desktop GisLayerControl card.
import { useState } from "react";
import { Search, SlidersHorizontal, Layers, Flame, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LAYER_META, HEALTH_COLOR, HEALTH_LABEL } from "./style";
import type { GisLayerId, SiteHealth } from "./api";
import type { GisControlProps, GisSiteType } from "./GisLayerControl";

const HEAT_METRICS = [
  { value: "tickets", label: "Work Order Aktif" },
  { value: "assets", label: "Jumlah Asset" },
  { value: "inspections", label: "Inspeksi" },
  { value: "sites", label: "Kepadatan Lokasi" },
];

const HEALTHS: SiteHealth[] = ["NORMAL", "WARNING", "CRITICAL", "OFFLINE"];

const TYPE_OPTIONS: { value?: GisSiteType; label: string }[] = [
  { value: undefined, label: "Semua" },
  { value: "GARDU", label: "Gardu" },
  { value: "GI", label: "GI" },
  { value: "GH", label: "GH" },
];

/** Sheet section heading. */
function SheetSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

export function GisMobileControls(props: GisControlProps) {
  const [layersOpen, setLayersOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const countFor = (id: GisLayerId) => props.catalog?.layers.find((l) => l.id === id)?.count;
  const activeLayerCount = props.activeLayers.size;

  return (
    <>
      {/* ── Floating search pill (top) — compact, Google-Maps style ─────────── */}
      <div className="pointer-events-none absolute inset-x-3 top-2.5 z-[1000]">
        <div className="pointer-events-auto relative">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="gis-search-mobile"
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder="Cari gardu…"
            inputMode="search"
            // Force a compact height — the Input base sets pointer-coarse:min-h-11
            // (44px) on touch, which is what made the bar look oversized.
            className="h-9 min-h-9 rounded-full border-border/50 bg-background/95 pl-9 pr-9 text-xs shadow-sm backdrop-blur pointer-coarse:min-h-9"
          />
          {props.search && (
            <button
              type="button"
              onClick={() => props.onSearch("")}
              aria-label="Hapus pencarian"
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground active:bg-accent"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Floating control stack — anchored well above the tab bar / safe area
          (nav-h includes the home-indicator inset), so it never overlaps the nav. */}
      {/* Clearance bumped to +4.5rem: PETUGAS phones stack a summary bar
          (GisMobileSummaryBar) directly above the tab bar; the extra room keeps
          these floating buttons from crowding it. Harmless on desktop (hidden)
          and for roles without the summary bar (just a bit more breathing room). */}
      <div className="absolute bottom-[calc(var(--bottomnav-h)+4.5rem)] right-3 z-[1000] flex flex-col gap-2">
        <button
          type="button"
          data-testid="gis-mobile-layers"
          onClick={() => setLayersOpen(true)}
          aria-label="Layer peta"
          className="relative grid size-12 place-items-center rounded-full border border-border/60 bg-background/95 text-foreground shadow-lg backdrop-blur active:scale-95"
        >
          <Layers className="size-5" />
          {activeLayerCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {activeLayerCount}
            </span>
          )}
        </button>
        <button
          type="button"
          data-testid="gis-mobile-filter"
          onClick={() => setFilterOpen(true)}
          aria-label="Filter peta"
          className="grid size-12 place-items-center rounded-full border border-border/60 bg-background/95 text-foreground shadow-lg backdrop-blur active:scale-95"
        >
          <SlidersHorizontal className="size-5" />
        </button>
      </div>

      {/* ── Layers sheet ────────────────────────────────────────────────────── */}
      <Drawer open={layersOpen} onOpenChange={setLayersOpen}>
        <DrawerContent className="max-h-[80vh]">
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <DrawerTitle className="flex items-center gap-2">
              <Layers className="size-4" /> Layer Peta
            </DrawerTitle>
          </div>
          <div className="space-y-5 overflow-y-auto px-4 pb-[calc(1rem+var(--safe-bottom))]">
            {/* Layer toggles */}
            <ul className="space-y-1">
              {LAYER_META.map((l) => {
                const count = countFor(l.id);
                return (
                  <li key={l.id}>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl p-2.5 active:bg-accent">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="size-3 shrink-0 rounded-full"
                          style={{ background: l.color }}
                        />
                        <span className="truncate text-sm font-medium">{l.label}</span>
                        {count != null && (
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] tabular-nums">
                            {count}
                          </Badge>
                        )}
                      </span>
                      <Switch
                        data-testid={`gis-layer-toggle-mobile-${l.id}`}
                        checked={props.activeLayers.has(l.id)}
                        onCheckedChange={() => props.onToggleLayer(l.id)}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>

            {/* Heatmap */}
            <div className="space-y-2 border-t border-border/60 pt-4">
              <label className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Flame className="size-4 text-orange-500" /> Heatmap
                </span>
                <Switch checked={props.heatmapOn} onCheckedChange={props.onToggleHeatmap} />
              </label>
              {props.heatmapOn && (
                <Select value={props.heatmapMetric} onValueChange={props.onHeatmapMetric}>
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HEAT_METRICS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Legend */}
            <div className="space-y-2 border-t border-border/60 pt-4">
              <SheetSectionTitle>Status Lokasi</SheetSectionTitle>
              <div className="grid grid-cols-2 gap-2">
                {HEALTHS.map((h) => (
                  <div key={h} className="flex items-center gap-2 text-sm">
                    <span className="size-3 rounded-full" style={{ background: HEALTH_COLOR[h] }} />
                    {HEALTH_LABEL[h]}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Filter sheet ────────────────────────────────────────────────────── */}
      <Drawer open={filterOpen} onOpenChange={setFilterOpen}>
        <DrawerContent className="max-h-[80vh]">
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <DrawerTitle className="flex items-center gap-2">
              <SlidersHorizontal className="size-4" /> Filter
            </DrawerTitle>
          </div>
          <div className="space-y-5 overflow-y-auto px-4 pb-[calc(1rem+var(--safe-bottom))]">
            {/* Tipe lokasi (functional) */}
            <div className="space-y-2">
              <SheetSectionTitle>Tipe Lokasi</SheetSectionTitle>
              <div className="grid grid-cols-4 gap-2">
                {TYPE_OPTIONS.map((o) => (
                  <Button
                    key={o.label}
                    size="sm"
                    variant={props.type === o.value ? "default" : "outline"}
                    className="h-10"
                    onClick={() => props.onType(o.value)}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Status (work order) */}
            <div className="space-y-2 border-t border-border/60 pt-4">
              <SheetSectionTitle>Status Work Order</SheetSectionTitle>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={!props.openTickets ? "default" : "outline"}
                  className="h-10"
                  onClick={() => props.onOpenTickets(false)}
                >
                  Semua
                </Button>
                <Button
                  size="sm"
                  variant={props.openTickets ? "default" : "outline"}
                  className="h-10"
                  onClick={() => props.onOpenTickets(true)}
                >
                  Ada WO Aktif
                </Button>
              </div>
            </div>

            {/* Wilayah (UP3) — real regions discovered from the loaded sites */}
            {props.regionOptions.length > 0 && (
              <div className="space-y-2 border-t border-border/60 pt-4">
                <SheetSectionTitle>Wilayah</SheetSectionTitle>
                <Select
                  value={props.up3 ?? "__all"}
                  onValueChange={(v) => props.onUp3(v === "__all" ? undefined : v)}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder="Semua Wilayah" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Semua Wilayah</SelectItem>
                    {props.regionOptions.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2 border-t border-border/60 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  props.onType(undefined);
                  props.onOpenTickets(false);
                  props.onUp3(undefined);
                }}
              >
                Reset
              </Button>
              <Button className="flex-1" onClick={() => setFilterOpen(false)}>
                Terapkan
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
