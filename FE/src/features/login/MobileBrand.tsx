import { BRAND_NAME, BRAND_SUBTITLE } from "@/lib/brand";
import { useCountUp } from "./useCountUp";
import { compact } from "./format";
import type { PublicStats } from "@/lib/api/stats";

interface MobileBrandProps {
  stats: PublicStats | null;
}

interface StatChipProps {
  value: number;
  label: string;
  suffix?: string;
  animate?: boolean;
}

function StatChip({ value, label, suffix = "", animate = true }: StatChipProps) {
  const animated = useCountUp(animate ? value : 0);
  const display = animate ? animated : value;

  return (
    <div className="rounded-lg border border-white/12 bg-white/8 py-1.75 text-center">
      <div className="text-[13px] font-bold tabular-nums text-white">
        {compact(display)}
        {suffix}
      </div>
      <div className="mt-0.5 text-[8px] font-medium uppercase tracking-wide text-white/50">
        {label}
      </div>
    </div>
  );
}

/**
 * Mobile-only "Split Glass" hero (<lg): a dark navy gradient banner with a
 * fine grid texture and ambient glows, the VoltHub lockup, tagline, and a
 * condensed three-chip live-metric row. The login card overlaps its bottom
 * edge (see routes/login.tsx) to complete the glass-panel effect.
 */
export function MobileBrand({ stats }: MobileBrandProps) {
  return (
    <div
      className="relative overflow-hidden px-4 pb-8 pt-[calc(var(--safe-top)+16px)] text-white lg:hidden"
      style={{ background: "linear-gradient(160deg, #0d1f4a 0%, #122060 50%, #0e1420 100%)" }}
    >
      <div className="grid-bg absolute inset-0 bg-size-[24px_24px]" aria-hidden />

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-10 -top-10 size-40 rounded-full bg-pln-blue/30 blur-2xl" />
        <div className="absolute -bottom-10 -right-10 size-40 rounded-full bg-pln-yellow/10 blur-2xl" />
      </div>

      <div className="relative">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7.5 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
            <img src="/icon-volthub.png" alt={BRAND_NAME} className="size-full object-contain" />
          </div>
          <div>
            <div className="text-lg font-bold leading-none">{BRAND_NAME}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-white/60">
              {BRAND_SUBTITLE}
            </div>
          </div>
        </div>

        <p className="mt-2.5 text-[11px] text-white/60">
          Platform operasional aset distribusi PLN
        </p>

        {stats && (
          <div className="mt-5 grid grid-cols-3 gap-2">
            <StatChip value={stats.sites} label="Gardu" />
            <StatChip value={stats.assets} label="Aset" />
            <StatChip value={stats.geoCoveragePct} label="Cakupan" suffix="%" animate={false} />
          </div>
        )}
      </div>
    </div>
  );
}
