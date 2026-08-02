// VoltHub — Dashboard chart primitives (recharts wrappers).
// Donut, bar, gauge, sparkline, dan trend area — palet Opsi C (lib/chart-config).
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  Legend,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, STATUS_CHART_COLORS } from "@/lib/chart-config";

// Peta status → warna kanonik Opsi C (hijau/kuning/merah/biru/abu).
export const STATUS_COLORS: Record<string, string> = STATUS_CHART_COLORS;

// Cocokkan nama slice ke warna tanpa peduli huruf besar/kecil.
function colorForName(name: string, fallback?: string): string {
  return fallback ?? STATUS_COLORS[name?.toUpperCase?.() ?? name] ?? CHART_COLORS.gray;
}

// Gaya tooltip konsisten (bg card, border 0.5px, radius 8px) — lib/chart-config.
const TOOLTIP = CHART_TOOLTIP_STYLE.contentStyle;
const TOOLTIP_LABEL = CHART_TOOLTIP_STYLE.labelStyle;
const TOOLTIP_ITEM = CHART_TOOLTIP_STYLE.itemStyle;

export interface Slice {
  name: string;
  value: number;
  color?: string;
}

export function DonutChart({ data, height = 200 }: { data: Slice[]; height?: number }) {
  const total = data.reduce((a, s) => a + s.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Belum ada data
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
          {data.map((s) => (
            <Cell key={s.name} fill={colorForName(s.name, s.color)} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={TOOLTIP}
          labelStyle={TOOLTIP_LABEL}
          itemStyle={TOOLTIP_ITEM}
          formatter={(v: number, n: string) => [v, n]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DonutLegend({ data }: { data: Slice[] }) {
  return (
    <div className="mt-2 space-y-1">
      {data.map((s) => (
        <div key={s.name} className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: colorForName(s.name, s.color) }} />
            {s.name}
          </span>
          <span className="font-semibold tabular-nums">{s.value}</span>
        </div>
      ))}
    </div>
  );
}

export function BarMini({ data, height = 200, color = "var(--color-chart-1)" }: { data: Slice[]; height?: number; color?: string }) {
  if (data.every((d) => d.value === 0)) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Belum ada data
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
        <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color ?? color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface TrendPoint {
  date: string;
  [series: string]: string | number;
}

export function TrendChart({
  data,
  series,
  height = 240,
}: {
  data: TrendPoint[];
  series: { key: string; color: string; label: string }[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Belum ada data tren
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} />
        <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            fill={`url(#grad-${s.key})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Primitif Opsi C ──────────────────────────────────────────────────────────

/** Bar chart dua seri (mis. Inspeksi vs HAR per hari) — grid horizontal saja. */
export function DualBarChart({
  data,
  series,
  height = 240,
}: {
  data: TrendPoint[];
  series: { key: string; color: string; label: string }[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Belum ada data
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <Tooltip
          contentStyle={TOOLTIP}
          labelStyle={TOOLTIP_LABEL}
          itemStyle={TOOLTIP_ITEM}
          cursor={{ fill: "var(--muted)", opacity: 0.3 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={18} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut dengan label total di tengah (angka besar + teks kecil). */
export function DonutWithCenter({
  data,
  height = 200,
  centerValue,
  centerLabel = "total",
  onSliceClick,
}: {
  data: Slice[];
  height?: number;
  /** Default: jumlah seluruh slice. */
  centerValue?: number | string;
  centerLabel?: string;
  onSliceClick?: (slice: Slice) => void;
}) {
  const total = data.reduce((a, s) => a + s.value, 0);
  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Belum ada data
      </div>
    );
  }
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={2}
            onClick={onSliceClick ? (_, i) => onSliceClick(data[i]) : undefined}
            className={onSliceClick ? "cursor-pointer" : undefined}
          >
            {data.map((s) => (
              <Cell key={s.name} fill={colorForName(s.name, s.color)} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP}
            labelStyle={TOOLTIP_LABEL}
            itemStyle={TOOLTIP_ITEM}
            formatter={(v: number, n: string) => [v, n]}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Label tengah — pointer-events none agar tooltip slice tetap jalan. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {centerValue ?? total.toLocaleString("id-ID")}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {centerLabel}
        </span>
      </div>
    </div>
  );
}

/** Legend dengan mini progress bar per segmen (persentase terhadap total). */
export function LegendBars({ data }: { data: Slice[] }) {
  const total = Math.max(
    1,
    data.reduce((a, s) => a + s.value, 0),
  );
  return (
    <div className="mt-3 space-y-2">
      {data.map((s) => {
        const color = colorForName(s.name, s.color);
        const pct = Math.round((s.value / total) * 100);
        return (
          <div key={s.name}>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-foreground">
                <span className="size-2 rounded-full" style={{ background: color }} />
                {s.name}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {s.value} · {pct}%
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Gauge semicircle (0–100%) — hijau ≥90, kuning 70–89, merah <70. */
export function GaugeSemicircle({
  value,
  label,
  height = 160,
}: {
  value: number;
  label: string;
  height?: number;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  const color =
    clamped >= 90 ? CHART_COLORS.success : clamped >= 70 ? CHART_COLORS.warning : CHART_COLORS.danger;
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={[{ value: clamped }]}
          innerRadius={60}
          outerRadius={90}
          startAngle={180}
          endAngle={0}
          cy="70%"
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            dataKey="value"
            angleAxisId={0}
            fill={color}
            background={{ fill: "var(--muted)" }}
            cornerRadius={4}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-col items-center">
        <span className="text-3xl font-semibold tabular-nums" style={{ color }}>
          {clamped}%
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

/** Sparkline area mini tanpa axis/grid/legend — aksen oranye PLN. */
export function SparkArea({
  data,
  height = 60,
  color = CHART_COLORS.primary,
}: {
  data: { date: string; value: number }[];
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return null;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="spark-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            contentStyle={TOOLTIP}
            labelStyle={TOOLTIP_LABEL}
            itemStyle={TOOLTIP_ITEM}
            formatter={(v: number) => [v, "Laporan"]}
            labelFormatter={(l: string) => l}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill="url(#spark-area-grad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
