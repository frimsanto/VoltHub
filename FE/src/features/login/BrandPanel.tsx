import { Activity, ClipboardCheck, ShieldCheck, FileBarChart } from "lucide-react";
import { BRAND_NAME, BRAND_SUBTITLE } from "@/lib/brand";
import { MetricStat } from "./MetricStat";
import type { PublicStats } from "@/lib/api/stats";

const CAPABILITIES = [
  { icon: Activity, label: "Asset Monitoring", desc: "Pemantauan kondisi aset telekomunikasi" },
  {
    icon: ClipboardCheck,
    label: "Survey & Inspeksi",
    desc: "Pencatatan inspeksi & temuan lapangan",
  },
  { icon: ShieldCheck, label: "Validation Workflow", desc: "Alur validasi laporan berjenjang" },
  { icon: FileBarChart, label: "Operational Reporting", desc: "Pelaporan operasional terpadu" },
] as const;

interface BrandPanelProps {
  stats: PublicStats | null;
}

/**
 * Desktop-only left brand panel (≥lg). Mesh gradient + subtle grid, strong
 * VoltHub identity, a live operational-metric strip, and capability highlights.
 * When `stats` is null (still loading or the public endpoint failed) the metric
 * strip is simply omitted — no placeholder numbers are ever shown.
 */
export function BrandPanel({ stats }: BrandPanelProps) {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex mesh-pln">
      {/* Grid overlay */}
      <div className="grid-bg absolute inset-0 opacity-[0.12]" aria-hidden />

      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -left-16 h-96 w-96 rounded-full bg-pln-blue/30 blur-[120px]" />
        <div className="absolute top-1/3 right-0 h-72 w-72 rounded-full bg-pln-yellow/12 blur-[100px]" />
        <div className="absolute bottom-0 left-1/3 h-60 w-60 rounded-full bg-pln-blue/20 blur-[90px]" />
      </div>

      {/* Brand lockup */}
      <div className="relative flex items-center gap-3">
        <div className="shadow-soft flex size-12 items-center justify-center overflow-hidden rounded-2xl bg-white">
          <img src="/icon-volthub.png" alt={BRAND_NAME} className="size-full object-contain" />
        </div>
        <div>
          <div className="text-xl font-bold leading-none">{BRAND_NAME}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/60">
            {BRAND_SUBTITLE}
          </div>
        </div>
      </div>

      {/* Headline + live metrics */}
      <div className="relative max-w-xl space-y-8">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight">
            Operational Intelligence untuk Aset Distribusi Telekomunikasi
          </h1>
          <p className="max-w-md text-white/70">
            Platform terpadu untuk memantau aset, mencatat inspeksi lapangan, dan memvalidasi
            laporan operasional secara real-time.
          </p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-t border-white/10 pt-8 sm:grid-cols-3">
            <MetricStat value={stats.sites} label="Total Gardu / Site" />
            <MetricStat value={stats.assets} label="Aset Dipantau" />
            <MetricStat value={stats.feeders} label="Penyulang" />
            <MetricStat value={stats.inspections} label="Inspeksi" />
            <MetricStat value={stats.harReports} label="Laporan HAR" />
            <MetricStat
              value={stats.geoCoveragePct}
              label="Cakupan Geografis"
              suffix="%"
              animate={false}
            />
          </div>
        )}
      </div>

      {/* Capability highlights + footer */}
      <div className="relative space-y-6">
        <div className="grid grid-cols-2 gap-3">
          {CAPABILITIES.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-pln-yellow/15 text-pln-yellow">
                <Icon className="size-4.5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{label}</div>
                <div className="truncate text-xs text-white/55">{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-xs text-white/45">© 2026 — PT. NAKANI RAYA GROUP</div>
      </div>
    </div>
  );
}
