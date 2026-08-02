// GisLayerControl — the floating control panel: layer toggles (with live counts),
// heatmap toggle + metric, search, and a health legend. Fully controlled by the
// page so the URL/state stays the single source of truth.
import { useRef, useState } from "react";
import { Search, Layers, Flame, SlidersHorizontal, X, GripVertical, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LAYER_META, HEALTH_COLOR, HEALTH_LABEL } from "./style";
import type { GisLayerId, LayerCatalog, SiteHealth } from "./api";

const HEAT_METRICS = [
  { value: "tickets", label: "Work Order Aktif" },
  { value: "assets", label: "Jumlah Asset" },
  { value: "inspections", label: "Inspeksi" },
  { value: "sites", label: "Kepadatan Lokasi" },
];

const HEALTHS: SiteHealth[] = ["NORMAL", "WARNING", "CRITICAL", "OFFLINE"];

export type GisSiteType = "GI" | "GH" | "GARDU";
const TYPE_OPTIONS: { value?: GisSiteType; label: string }[] = [
  { value: undefined, label: "Semua" },
  { value: "GARDU", label: "Gardu" },
  { value: "GI", label: "GI" },
  { value: "GH", label: "GH" },
];

export interface GisControlProps {
  catalog?: LayerCatalog;
  activeLayers: Set<GisLayerId>;
  onToggleLayer: (id: GisLayerId) => void;
  heatmapOn: boolean;
  onToggleHeatmap: (on: boolean) => void;
  heatmapMetric: string;
  onHeatmapMetric: (m: string) => void;
  search: string;
  onSearch: (s: string) => void;
  type?: GisSiteType;
  onType: (t?: GisSiteType) => void;
  /** Status filter — only sites with active work orders. */
  openTickets: boolean;
  onOpenTickets: (v: boolean) => void;
  /** Wilayah (UP3) filter; undefined = all regions. */
  up3?: string;
  onUp3: (v?: string) => void;
  /** Distinct regions discovered from the loaded sites (real data). */
  regionOptions: string[];
  /**
   * Docked desktop layout: render as a static, full-height side panel (no
   * floating/drag/collapse) so the map is never covered — the enterprise
   * "30% control panel" pattern. Phones keep using GisMobileControls.
   */
  docked?: boolean;
}

export function GisLayerControl(props: GisControlProps) {
  const countFor = (id: GisLayerId) => props.catalog?.layers.find((l) => l.id === id)?.count;

  // The control body (search → legend) is shared by the floating overlay and the
  // docked desktop panel — defined once so both layouts stay in sync.
  const body = (
    <>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-testid="gis-search-desktop"
          value={props.search}
          onChange={(e) => props.onSearch(e.target.value)}
          placeholder="Cari nama gardu…"
          className="h-9 pl-8 text-sm"
        />
      </div>

      {/* Type filter (Gardu / GI / GH) */}
      <div className="flex gap-1">
        {TYPE_OPTIONS.map((o) => (
          <Button
            key={o.label}
            size="sm"
            variant={props.type === o.value ? "default" : "outline"}
            className="h-7 flex-1 px-0 text-xs"
            onClick={() => props.onType(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>

      {/* Status (work order) */}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={!props.openTickets ? "default" : "outline"}
          className="h-7 flex-1 px-0 text-xs"
          onClick={() => props.onOpenTickets(false)}
        >
          Semua
        </Button>
        <Button
          size="sm"
          data-testid="gis-filter-status"
          variant={props.openTickets ? "default" : "outline"}
          className="h-7 flex-1 px-0 text-xs"
          onClick={() => props.onOpenTickets(true)}
        >
          Ada WO Aktif
        </Button>
      </div>

      {/* Wilayah (UP3) — options derived from loaded sites */}
      {props.regionOptions.length > 0 && (
        <Select
          value={props.up3 ?? "__all"}
          onValueChange={(v) => props.onUp3(v === "__all" ? undefined : v)}
        >
          <SelectTrigger data-testid="gis-filter-wilayah" className="h-8 text-xs">
            <SelectValue placeholder="Semua Wilayah" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all" className="text-xs">
              Semua Wilayah
            </SelectItem>
            {props.regionOptions.map((r) => (
              <SelectItem key={r} value={r} className="text-xs">
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Layers */}
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Layers className="size-3.5" /> Layer
        </div>
        <ul className="space-y-2">
          {LAYER_META.map((l) => {
            const count = countFor(l.id);
            return (
              <li key={l.id} className="flex items-center justify-between gap-2">
                <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: l.color }}
                  />
                  <span className="truncate">{l.label}</span>
                  {count != null && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px] tabular-nums">
                      {count}
                    </Badge>
                  )}
                </label>
                <Switch
                  data-testid={`gis-layer-toggle-desktop-${l.id}`}
                  checked={props.activeLayers.has(l.id)}
                  onCheckedChange={() => props.onToggleLayer(l.id)}
                />
              </li>
            );
          })}
        </ul>
      </div>

      {/* Heatmap */}
      <div className="space-y-2 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-sm font-medium">
            <Flame className="size-3.5 text-orange-500" /> Heatmap
          </label>
          <Switch checked={props.heatmapOn} onCheckedChange={props.onToggleHeatmap} />
        </div>
        {props.heatmapOn && (
          <Select value={props.heatmapMetric} onValueChange={props.onHeatmapMetric}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEAT_METRICS.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Legend */}
      <div className="border-t border-border/60 pt-3">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Status
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {HEALTHS.map((h) => (
            <div key={h} className="flex items-center gap-1.5 text-xs">
              <span className="size-2.5 rounded-full" style={{ background: HEALTH_COLOR[h] }} />
              {HEALTH_LABEL[h]}
            </div>
          ))}
        </div>
      </div>

      {/* Statistics (docked desktop panel only) — real catalog counts per layer.
          Mobile keeps its own controls (GisMobileControls), so this never renders
          there. */}
      {props.docked && props.catalog && (
        <div className="border-t border-border/60 pt-3" data-testid="gis-statistics">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <BarChart3 className="size-3.5" /> Statistik
          </div>
          <div className="grid grid-cols-2 gap-2">
            {props.catalog.layers.map((l) => (
              <div key={l.id} className="rounded-lg border border-border/60 p-2.5">
                <div className="text-lg font-bold tabular-nums leading-none">{l.count}</div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">{l.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  // Collapsible: the panel can shrink to a small "Filter" pill so it doesn't
  // cover the map. Default open on first load.
  const [open, setOpen] = useState(true);

  // Draggable: grab the header (or the collapsed pill) to move the control
  // anywhere over the map. `pos` is in px relative to the map container; while
  // it's null the panel sits in its default top-right corner.
  const wrapRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ dx: 0, dy: 0 });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const startDrag = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const rect = el.getBoundingClientRect();
    const prect = parent.getBoundingClientRect();
    offsetRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    // Anchor to pixels at the current spot so there's no jump from the corner.
    setPos({ x: rect.left - prect.left, y: rect.top - prect.top });
    setDragging(true);

    const move = (ev: PointerEvent) => {
      const maxX = Math.max(0, parent.clientWidth - el.offsetWidth);
      const maxY = Math.max(0, parent.clientHeight - el.offsetHeight);
      const x = Math.min(Math.max(0, ev.clientX - prect.left - offsetRef.current.dx), maxX);
      const y = Math.min(Math.max(0, ev.clientY - prect.top - offsetRef.current.dy), maxY);
      setPos({ x, y });
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Shared positioning wrapper — the corner default OR an absolute px position
  // once dragged. A little scale + shadow gives feedback while held.
  const wrapClass = cn(
    "absolute z-[1000] transition-transform duration-150",
    !pos && "right-4 top-4",
    dragging && "scale-[1.03] cursor-grabbing",
  );
  const wrapStyle = pos ? { left: pos.x, top: pos.y } : undefined;

  // Docked desktop panel — static, full height, no overlay/drag. Declared after
  // the floating-variant hooks so hook order stays stable across renders.
  if (props.docked) {
    return (
      <div className="flex h-full flex-col bg-card">
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3 text-sm font-semibold">
          <SlidersHorizontal className="size-4 text-muted-foreground" /> Filter &amp; Layer
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">{body}</div>
      </div>
    );
  }

  if (!open) {
    return (
      <div ref={wrapRef} className={wrapClass} style={wrapStyle}>
        <Button
          onPointerDown={startDrag}
          onClick={() => setOpen(true)}
          size="sm"
          className="gap-2 rounded-full shadow-lg"
          style={{ touchAction: "none" }}
        >
          <SlidersHorizontal className="size-4" /> Filter
        </Button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={wrapClass} style={wrapStyle}>
      <Card className="flex max-h-[70vh] w-[260px] flex-col overflow-hidden rounded-2xl border-border/60 bg-card/95 shadow-lg backdrop-blur">
        <CardContent className="space-y-4 overflow-y-auto p-4">
          {/* Header — drag handle + collapse so the map isn't permanently covered */}
          <div
            onPointerDown={startDrag}
            className={cn(
              "-mx-1 flex select-none items-center justify-between rounded-md px-1",
              dragging ? "cursor-grabbing" : "cursor-grab",
            )}
            style={{ touchAction: "none" }}
          >
            <span className="flex items-center gap-1 text-sm font-semibold">
              <GripVertical className="size-4 text-muted-foreground" /> Filter Peta
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setOpen(false)}
              aria-label="Sembunyikan filter"
            >
              <X className="size-4" />
            </Button>
          </div>

          {body}
        </CardContent>
      </Card>
    </div>
  );
}
