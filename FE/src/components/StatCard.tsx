// VoltHub — StatCard (redesign konsolidasi dashboard).
// Kartu KPI headline command center: border KIRI 3px warna accent + baris
// ikon-tint + label uppercase 11px + nilai 28px tabular + sparkline opsional.
// `loading` merender skeleton shimmer (perilaku lama dipertahankan), dan
// data-testid="dashboard-kpi-card" tetap ada untuk E2E (e2e/selectors.ts).
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/features/v2/dashboard/widgets";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value?: string | number;
  /** Hex accent: '#f97316' | '#3b82f6' | '#8b5cf6' | '#22c55e' | '#ef4444' dst. */
  accentColor: string;
  icon: ReactNode;
  sub?: string;
  loading?: boolean;
  className?: string;
  /** Jika diisi, seluruh kartu menjadi link ke rute ini. */
  to?: string;
  /** Mini-seri untuk sparkline bawah (data real saja; kosongkan bila tak ada). */
  trend?: number[];
}

export function StatCard({
  label,
  value,
  accentColor,
  icon,
  sub,
  loading,
  className,
  to,
  trend,
}: StatCardProps) {
  const inner = (
    <div
      data-testid="dashboard-kpi-card"
      className={cn(
        "relative overflow-hidden rounded-[10px] border border-border bg-card p-[12px]",
        to &&
          "cursor-pointer transition-all duration-150 hover:-translate-y-px hover:shadow-md hover:shadow-black/10",
        className,
      )}
    >
      {/* Border kiri 3px warna accent — identitas status kartu. */}
      <div
        className="absolute bottom-0 left-0 top-0 w-[3px]"
        style={{ background: accentColor }}
        aria-hidden
      />
      {/* Baris ikon (tint) + label uppercase. */}
      <div className="mb-[10px] flex items-center gap-2">
        <div
          className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px]"
          style={{ background: accentColor + "18" }}
        >
          <div style={{ color: accentColor }}>{icon}</div>
        </div>
        <p className="truncate text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
      </div>
      <div className="text-[28px] font-bold leading-none tabular-nums text-foreground [font-feature-settings:'tnum']">
        {loading ? (
          <Skeleton className="shimmer h-7 w-16" />
        ) : typeof value === "number" ? (
          value.toLocaleString("id-ID")
        ) : (
          (value ?? "—")
        )}
      </div>
      {sub && !loading && (
        <p className="mt-[4px] text-[11px]" style={{ color: accentColor }}>
          {sub}
        </p>
      )}
      {!loading && trend && trend.length >= 2 && <Sparkline data={trend} color={accentColor} />}
    </div>
  );

  if (to) {
    return (
      <Link to={to as never} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

// ── Grid KPI band ─────────────────────────────────────────────────────────────
// Deretan StatCard untuk baris KPI headline command center — 1 kolom di layar
// sempit, 2 kolom <1024px, 5 kolom di desktop.
export interface StatCell {
  label: string;
  value?: number | string;
  sub?: string;
  icon: LucideIcon;
  /** Warna accent hex (CHART_COLORS). */
  accent: string;
  loading?: boolean;
  /** Route tujuan saat kartu diklik. */
  to?: string;
  /** Mini-seri sparkline (data real saja). */
  trend?: number[];
}

export function StatCardGrid({ cells }: { cells: StatCell[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {cells.map((c) => (
        <StatCard
          key={c.label}
          label={c.label}
          value={c.value}
          sub={c.sub}
          accentColor={c.accent}
          icon={<c.icon className="size-[13px]" />}
          loading={c.loading}
          to={c.to}
          trend={c.trend}
        />
      ))}
    </div>
  );
}
