// VoltHub V2 — StatCard (premium KPI tile).
// Presentational only: label + value + optional sub/trend/icon with a PLN accent.
// Hover lifts the card 2px (transform only — no layout shift). Distinct from the
// legacy features/v2/dashboard/widgets StatCard; dashboards adopt this
// incrementally.
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  trend?: { value: number; positive?: boolean };
  accent?: "blue" | "yellow" | "green" | "red";
  className?: string;
}

const ACCENT_MAP = {
  blue: "text-pln-blue bg-pln-blue/10 border-pln-blue/20",
  yellow: "text-pln-yellow bg-pln-yellow/10 border-pln-yellow/20",
  green: "text-success bg-success/10 border-success/20",
  red: "text-destructive bg-destructive/10 border-destructive/20",
} as const;

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  accent = "blue",
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-lg hover:shadow-black/20",
        className,
      )}
    >
      {/* Subtle gradient accent top */}
      <div
        className="pointer-events-none absolute left-0 top-0 h-20 w-full bg-linear-to-b from-primary/5 to-transparent"
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            {label}
          </p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                trend.positive ? "text-success" : "text-destructive",
              )}
            >
              {trend.positive ? "↑" : "↓"} {Math.abs(trend.value)}%
            </span>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl border",
              ACCENT_MAP[accent],
            )}
          >
            <Icon className="size-5" />
          </div>
        )}
      </div>
    </div>
  );
}
