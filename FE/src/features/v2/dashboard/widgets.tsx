// VoltHub — Dashboard widgets (stat cards, section card, recent list, device
// status panel). The DeviceStatusPanel is the placeholder architecture for live
// RTU/Rectifier/Battery/Comm-media status (OOP/INSCAN integration phase): the
// device-count column is real today; the status column renders a "belum
// terhubung" placeholder and accepts a `status` prop to wire later.
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Radio, Server, BatteryCharging, Cpu, ChevronDown, type LucideIcon } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/useCountUp";

// KPI band Opsi C (KpiBand) sudah digantikan StatCardGrid (components/StatCard.tsx)
// — deretan kartu KPI headline kini milik komponen bersama Opsi D.

/** Renders a numeric value with an ease-out count-up; passes strings through. */
function StatValue({ value }: { value?: number | string }) {
  const isNumber = typeof value === "number";
  const animated = useCountUp(isNumber ? value : 0);
  if (isNumber) return <>{animated.toLocaleString("id-ID")}</>;
  return <>{value ?? 0}</>;
}

/** Tiny axis-less area sparkline that sits at the bottom edge of a StatCard. */
export function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div className="-mx-5 -mb-5 mt-3 h-9 opacity-90">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#spark-${color.replace("#", "")})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  to,
  search,
  tone = "text-primary bg-primary/10",
  trend,
  trendColor = "var(--color-primary)",
  accent,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value?: number | string;
  loading?: boolean;
  to?: string;
  /** Search params tujuan (mis. filter status) — hanya dipakai bila `to` ada. */
  search?: Record<string, unknown>;
  tone?: string;
  /** Optional mini-series for a bottom sparkline (real data only; omit if none). */
  trend?: number[];
  trendColor?: string;
  /** Warna border-kiri 3px untuk KPI penting (hex/var) — kosong = tanpa aksen. */
  accent?: string;
  /** Baris kecil di bawah label (konteks tambahan, data real saja). */
  sub?: string;
}) {
  const inner = (
    <>
      {accent && (
        <div
          className="absolute bottom-0 left-0 top-0 w-[3px]"
          style={{ background: accent }}
          aria-hidden
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`grid size-7 shrink-0 place-items-center rounded-md ${tone}`}>
            <Icon className="size-3.5" />
          </span>
          <span className="truncate text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
        </div>
      </div>
      <div className="mt-3 text-[28px] font-bold leading-none tabular-nums [font-feature-settings:'tnum']">
        {loading ? <Skeleton className="shimmer h-7 w-16" /> : <StatValue value={value} />}
      </div>
      {sub && !loading && <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>}
      {!loading && trend && trend.length >= 2 && <Sparkline data={trend} color={trendColor} />}
    </>
  );
  const cls =
    "group relative overflow-hidden rounded-[10px] border border-border bg-card p-5 transition-all duration-150 hover:-translate-y-px hover:shadow-md hover:shadow-black/10";
  return to ? (
    <Link to={to as never} search={search as never} data-testid="dashboard-kpi-card" className={`${cls} block hover:border-primary/40`}>{inner}</Link>
  ) : (
    <div data-testid="dashboard-kpi-card" className={cls}>{inner}</div>
  );
}

/** Header bersama SectionCard/CollapsibleSection: ikon 14px + label uppercase. */
function SectionTitle({ title, icon: Icon }: { title: string; icon?: LucideIcon }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium">
      {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
    </span>
  );
}

export function SectionCard({
  title,
  icon: Icon,
  action,
  children,
  className,
  testId,
}: {
  title: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Stable hook for E2E (applied to the card root). */
  testId?: string;
}) {
  return (
    <section
      className={cn("rounded-[10px] border border-border bg-card", className)}
      data-testid={testId}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <SectionTitle title={title} icon={Icon} />
        {action}
      </div>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  );
}

/**
 * Section yang bisa dilipat (Import Monitoring, GI Status, KPI lengkap).
 * Konten di-unmount saat tertutup (perilaku Radix default), sehingga query di
 * dalamnya baru menembak saat user membukanya.
 */
export function CollapsibleSection({
  title,
  icon: Icon,
  action,
  defaultOpen = false,
  children,
  className,
  testId,
}: {
  title: string;
  icon?: LucideIcon;
  /** Dirender di kanan header, di LUAR tombol trigger (boleh Link/Button). */
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("rounded-[10px] border border-border bg-card", className)}
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <CollapsibleTrigger className="flex flex-1 cursor-pointer items-center justify-between gap-2 text-left">
          <SectionTitle title={title} icon={Icon} />
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        {action}
      </div>
      <CollapsibleContent>
        <div className="tab-fade flex flex-col gap-3 p-4 pt-0">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function RecentList<T>({
  items,
  isLoading,
  empty = "Belum ada data",
  render,
}: {
  items: T[];
  isLoading?: boolean;
  empty?: string;
  render: (item: T) => ReactNode;
}) {
  if (isLoading) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((it, i) => (
        <li key={i} className="py-2.5">{render(it)}</li>
      ))}
    </ul>
  );
}

// ── Device status (placeholder architecture for OOP/INSCAN) ───────────────────
export interface DeviceLiveStatus {
  normal: number;
  warning: number;
  down: number;
}
interface DeviceRow {
  key: "rtu" | "rectifier" | "battery" | "commMedia";
  label: string;
  icon: LucideIcon;
  total: number;
  status?: DeviceLiveStatus | null; // null/undefined → placeholder
}

const DEVICE_ICONS: Record<DeviceRow["key"], LucideIcon> = {
  rtu: Server,
  rectifier: Cpu,
  battery: BatteryCharging,
  commMedia: Radio,
};

export function DeviceStatusPanel({
  counts,
  isLoading,
}: {
  counts: { rtu: number; rectifier: number; battery: number; commMedia: number };
  isLoading?: boolean;
}) {
  const rows: DeviceRow[] = [
    { key: "rtu", label: "RTU Status", icon: DEVICE_ICONS.rtu, total: counts.rtu, status: null },
    { key: "rectifier", label: "Rectifier Status", icon: DEVICE_ICONS.rectifier, total: counts.rectifier, status: null },
    { key: "battery", label: "Battery Status", icon: DEVICE_ICONS.battery, total: counts.battery, status: null },
    { key: "commMedia", label: "Communication Media Status", icon: DEVICE_ICONS.commMedia, total: counts.commMedia, status: null },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.key} className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <r.icon className="size-4 text-muted-foreground" /> {r.label}
              </span>
              <span className="text-lg font-bold tabular-nums">{isLoading ? "…" : r.total}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {r.status ? (
                <>
                  <Badge className="border-transparent bg-green-500/15 text-green-700 dark:text-green-400">{r.status.normal} Normal</Badge>
                  <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">{r.status.warning} Warning</Badge>
                  <Badge className="border-transparent bg-red-500/15 text-red-700 dark:text-red-400">{r.status.down} Down</Badge>
                </>
              ) : (
                <Badge variant="outline" className="text-[11px] text-muted-foreground">
                  Status real-time menunggu integrasi OOP/INSCAN
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Jumlah perangkat diambil dari registry aset. Status operasional per perangkat (Normal/Warning/Down)
        akan terisi otomatis saat sumber data OOP/INSCAN terhubung.
      </p>
    </div>
  );
}
