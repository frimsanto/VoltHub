import { useCountUp } from "./useCountUp";
import { compact, full } from "./format";

interface MetricStatProps {
  value: number;
  label: string;
  /** Render compact (mobile) vs. full grouped digits (desktop). */
  variant?: "full" | "compact";
  /** Suffix appended verbatim after the animated number, e.g. "%". */
  suffix?: string;
  /** Skip the count-up (e.g. percentages animate oddly when rounded). */
  animate?: boolean;
}

/** A single animated operational figure + caption. Theme-token driven. */
export function MetricStat({
  value,
  label,
  variant = "full",
  suffix = "",
  animate = true,
}: MetricStatProps) {
  const animated = useCountUp(animate ? value : 0);
  const display = animate ? animated : value;
  const text = variant === "compact" ? compact(display) : full(display);
  // Compact (mobile stat bar) starts a size class up from full (desktop-only,
  // always ≥sm in practice) so the numbers stay legible without zoom.
  const numberClass =
    variant === "compact"
      ? "text-3xl font-bold tabular-nums leading-none tracking-tight sm:text-4xl"
      : "text-2xl font-bold tabular-nums tracking-tight sm:text-3xl";

  return (
    <div className="min-w-0">
      <div className={numberClass}>
        {text}
        {suffix}
      </div>
      <div className="mt-1.5 truncate text-xs font-medium uppercase tracking-wider text-white/60">
        {label}
      </div>
    </div>
  );
}
