// VoltHub — Management Overview, split into the two operating domains so each
// has its own focused dashboard (see routes /scada and /lapangan):
//   • ScadaOverview — dataset/automated world (Gardu/Penyulang/Asset/RC SCADA,
//     availability & performance). Fed by the SCADA registry + IFS imports.
//   • FieldOverview — field-team world (Inspeksi/HAR/Work Order activity).
// `OverviewKpis` keeps rendering both, in case a combined view is still wanted.
// Real counts come from the backend; SCADA/ticket figures use the demo adapter
// (see lib/v2/demo-adapter.ts) until live wiring lands.
import {
  Building2,
  GitBranch,
  Boxes,
  RadioTower,
  ClipboardCheck,
  ShieldCheck,
  Ticket,
  CheckCircle2,
  TrendingUp,
  PieChart,
  BarChart3,
} from "lucide-react";
import { CHART_COLORS } from "@/lib/chart-config";
import { StatCard, SectionCard } from "./widgets";
import { TrendChart, DonutChart, DonutLegend, BarMini, type Slice } from "./charts";
import {
  useGarduOverview,
  useMonthlyOps,
  useTicketCounts,
  useOperationsTrend,
  useAssetStatusBreakdown,
} from "./api";
import { usePerformanceDashboard } from "@/features/v2/performance/resource";

/**
 * Dataset / SCADA domain (tab Overview di /scada) — information-first:
 *   Row 1: 4 StatCard (Gardu | Penyulang | Asset | RC Inscan, sub OOP)
 *   Row 2: donut Asset Status (1/3) + tren Availability (2/3)
 * Angka RC Inscan/OOP real dari snapshot SP7 (useGarduOverview →
 * /assets/scada/summary); klik kartu berpindah ke tab Inscan/OOP.
 */
export function ScadaOverview() {
  const o = useGarduOverview();
  const perf = usePerformanceDashboard();
  const assetStatus = useAssetStatusBreakdown();

  return (
    <div className="space-y-6">
      {/* Registry & RC headline figures */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Total Gardu"
          value={o.totalGardu}
          loading={o.isLoading}
          to="/gardu"
          tone="text-blue-600 dark:text-blue-400 bg-blue-500/10"
        />
        <StatCard
          icon={GitBranch}
          label="Total Penyulang"
          value={o.totalPenyulang}
          loading={o.isLoading}
          to="/penyulang"
          tone="text-cyan-600 dark:text-cyan-400 bg-cyan-500/10"
        />
        <StatCard
          icon={Boxes}
          label="Total Asset"
          value={o.totalAsset}
          loading={o.isLoading}
          to="/asset"
          tone="text-indigo-600 dark:text-indigo-400 bg-indigo-500/10"
        />
        <StatCard
          icon={RadioTower}
          label="RC Inscan"
          value={o.rcInscan}
          sub={o.rcOop != null ? `OOP: ${o.rcOop.toLocaleString("id-ID")} RTU` : undefined}
          loading={o.isLoading}
          to="/scada"
          search={{ tab: "inscan", status: "UP" }}
          tone="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
          accent={CHART_COLORS.success}
        />
      </div>

      {/* Asset Status donut (1/3) + tren Availability (2/3) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SectionCard title="Asset Status" icon={PieChart}>
          <DonutChart data={assetStatus.data} />
          <DonutLegend data={assetStatus.data} />
        </SectionCard>

        <SectionCard
          title="Tren Availability (%)"
          icon={TrendingUp}
          className="lg:col-span-2"
        >
          {perf.isEmpty ? (
            <p className="flex h-60 items-center justify-center text-sm text-muted-foreground">
              Belum ada data performance. Impor data untuk melihat tren.
            </p>
          ) : (
            <TrendChart
              data={perf.trend}
              series={[{ key: "Availability", color: CHART_COLORS.primary, label: "Availability %" }]}
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

/**
 * Field-team domain: monthly inspection/HAR activity and work-order status.
 * No registry/SCADA figures here — this is what the field operation produces.
 */
export function FieldOverview() {
  const ops = useMonthlyOps();
  const ticketCounts = useTicketCounts();
  const opsTrend = useOperationsTrend();

  const inspSeries = opsTrend.inspTrend.map((p) => Number(p.Inspeksi ?? 0));
  const harSeries = opsTrend.harTrend.map((p) => Number(p.HAR ?? 0));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={ClipboardCheck}
          label="Inspection Bulan Ini"
          value={ops.inspectionThisMonth}
          loading={ops.isLoading}
          to="/laporan-monitoring"
          tone="text-orange-600 dark:text-orange-400 bg-orange-500/10"
          trend={inspSeries}
          trendColor={CHART_COLORS.primary}
        />
        <StatCard
          icon={ShieldCheck}
          label="HAR Bulan Ini"
          value={ops.harThisMonth}
          loading={ops.isLoading}
          to="/laporan-monitoring"
          tone="text-blue-600 dark:text-blue-400 bg-blue-500/10"
          trend={harSeries}
          trendColor={CHART_COLORS.secondary}
        />
        <StatCard
          icon={Ticket}
          label="Open Work Order"
          value={ticketCounts.open}
          loading={ticketCounts.isLoading}
          to="/work-order"
          tone="text-rose-600 dark:text-rose-400 bg-rose-500/10"
        />
        <StatCard
          icon={CheckCircle2}
          label="Closed Work Order"
          value={ticketCounts.closed}
          loading={ticketCounts.isLoading}
          to="/work-order"
          tone="text-green-600 dark:text-green-400 bg-green-500/10"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Status Work Order" icon={PieChart}>
          {(() => {
            const data: Slice[] = [
              { name: "Open", value: ticketCounts.open ?? 0, color: CHART_COLORS.danger },
              { name: "Closed", value: ticketCounts.closed ?? 0, color: CHART_COLORS.success },
            ];
            return (
              <div>
                <DonutChart data={data} />
                <DonutLegend data={data} />
              </div>
            );
          })()}
        </SectionCard>

        <SectionCard title="Operasi Bulan Ini" icon={BarChart3}>
          <BarMini
            data={[
              { name: "Inspeksi", value: ops.inspectionThisMonth ?? 0, color: CHART_COLORS.primary },
              { name: "HAR", value: ops.harThisMonth ?? 0, color: CHART_COLORS.secondary },
            ]}
            height={232}
          />
        </SectionCard>
      </div>
    </div>
  );
}

/** Combined band (SCADA + field) — retained for the legacy /dashboard landing. */
export function OverviewKpis() {
  return (
    <div className="space-y-6">
      <ScadaOverview />
      <FieldOverview />
    </div>
  );
}
