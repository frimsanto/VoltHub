// VoltHub — MANAGER Command Center (enterprise decision-maker dashboard).
//
// MANAGER is a READ-ONLY monitoring/decision role (no write capability — see
// lib/v2/rbac). This center is information-first and surfaces the figures a
// manager decides on: volume, approval throughput, SLA, and regional comparison.
//
//   1. KPI band            — Total Laporan / Pending / Approved / Rejected / SLA
//   2. Operational         — multi-range Laporan trend  +  Approval performance
//   3. Regional comparison — Top RTUPP / Top UP3 / Wilayah bermasalah
//   4. Monitoring          — Pending approval queue (read-only) + Critical reports
//
// REAL DATA ONLY — every figure derives from existing endpoints:
//   /kpi/dashboard (summary, sla, monthlyTrend), /dashboard/stats (daily trend),
//   /rekap (RTUPP/UP3 rollups), /history (report lists). No write actions are
//   rendered (manager would 403), so the queue is view-only.
import { useMemo, useState } from "react";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Timer,
  TrendingUp,
  GaugeCircle,
  Building2,
  MapPinned,
  AlertTriangle,
  ClipboardList,
  Flame,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CHART_COLORS } from "@/lib/chart-config";
import { StatCardGrid, type StatCell } from "@/components/StatCard";
import { SectionCard, RecentList, CollapsibleSection } from "./widgets";
import { KpiDashboard } from "@/features/v2/kpi/KpiDashboard";
import { GiStatusSection } from "@/features/v2/gi-dashboard/GiStatusSection";
import { TrendChart, DonutWithCenter, LegendBars, type TrendPoint, type Slice } from "./charts";
import { useReportRollups, type ReportRollup } from "./api";
import { useDashboardStatsRaw } from "./activity";
import { useKpiDashboard } from "@/features/v2/kpi/api";
import { useWorkOrderSummary } from "@/features/v2/work-orders/resource";
import { WO_STATUS_LABELS, type WorkOrderStatus } from "@/lib/v2/enums";
import {
  ReportStatusBadge,
  ReportJenisBadge,
  getReportLocation,
  useReports,
} from "@/features/report";
import type { HistoryItem } from "@/lib/api/history";

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

// ── 2a. Laporan trend (7 / 30 hari / 6 bulan) ─────────────────────────────────
type TrendRange = "7" | "30" | "month";

function LaporanTrend() {
  const stats = useDashboardStatsRaw();
  const kpi = useKpiDashboard({ months: 6 });
  const [range, setRange] = useState<TrendRange>("30");

  // Daily series (Laporan Awal vs Akhir) from the V1 dashboard stats endpoint.
  const daily: TrendPoint[] = useMemo(
    () =>
      (stats.data?.trendReports ?? []).map((p) => ({
        date: p.date,
        Awal: Number(p.awal ?? 0),
        Akhir: Number(p.akhir ?? 0),
      })),
    [stats.data?.trendReports],
  );

  // Monthly series (total vs selesai) from the KPI endpoint.
  const monthly: TrendPoint[] = useMemo(
    () =>
      (kpi.data?.monthlyTrend ?? []).map((m) => ({
        date: m.label,
        Pekerjaan: m.total,
        Selesai: m.selesai,
      })),
    [kpi.data?.monthlyTrend],
  );

  const isMonthly = range === "month";
  const data = isMonthly ? monthly : range === "7" ? daily.slice(-7) : daily.slice(-30);
  const series = isMonthly
    ? [
        { key: "Pekerjaan", color: CHART_COLORS.primary, label: "Total" },
        { key: "Selesai", color: CHART_COLORS.success, label: "Selesai" },
      ]
    : [
        { key: "Awal", color: CHART_COLORS.primary, label: "Laporan Awal" },
        { key: "Akhir", color: CHART_COLORS.secondary, label: "Laporan Akhir" },
      ];

  const ranges: { key: TrendRange; label: string }[] = [
    { key: "7", label: "7 Hari" },
    { key: "30", label: "30 Hari" },
    { key: "month", label: "6 Bulan" },
  ];

  const loading = isMonthly ? kpi.isLoading : stats.isLoading;

  return (
    <SectionCard
      title="Trend Laporan"
      icon={TrendingUp}
      className="lg:col-span-2"
      action={
        <div className="inline-flex rounded-lg border border-border/60 p-0.5">
          {ranges.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition",
                range === r.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      {loading ? <Skeleton className="h-60 w-full" /> : <TrendChart data={data} series={series} />}
    </SectionCard>
  );
}

// ── 2b. Approval performance (SLA throughput) ─────────────────────────────────
function ApprovalPerformance() {
  const kpi = useKpiDashboard({ months: 6 });
  const sla = kpi.data?.sla;
  const summary = kpi.data?.summary;
  const rate = sla?.slaCompletionRate ?? 0;

  const stat = (label: string, value: string | number, tone?: string) => (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-lg font-bold tabular-nums", tone)}>{value}</div>
    </div>
  );

  return (
    <SectionCard title="Approval Performance" icon={GaugeCircle}>
      {kpi.isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-end justify-between">
              <span className="text-sm text-muted-foreground">SLA Compliance</span>
              <span className="text-2xl font-semibold tabular-nums">{rate}%</span>
            </div>
            {/* Bar + garis threshold 90% (merah putus-putus) — target SLA. */}
            <div className="relative mt-2 h-2 rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  rate >= 90 ? "bg-emerald-500" : rate >= 75 ? "bg-amber-500" : "bg-red-500",
                )}
                style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
              />
              <div
                className="absolute -inset-y-1 left-[90%] w-0 border-l border-dashed border-red-500"
                aria-hidden
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {sla?.withinSla ?? 0} dari {sla?.finalized ?? 0} laporan selesai dalam{" "}
                {sla?.slaWindowHours ?? 48} jam
              </span>
              <span className="shrink-0 text-red-500">target 90%</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {stat(
              "Rata-rata Approval",
              sla?.avgApprovalHours != null ? `${sla.avgApprovalHours} jam` : "—",
            )}
            {stat("Pending", summary?.pendingApproval ?? 0, "text-amber-600 dark:text-amber-400")}
            {stat("Selesai", summary?.pekerjaanSelesai ?? 0, "text-emerald-600 dark:text-emerald-400")}
            {stat("Ditolak", summary?.rejected ?? 0, "text-red-600 dark:text-red-400")}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── 2c. Donut status laporan (read-only, sama seperti Admin) ──────────────────
function ManagerStatusDonut() {
  const kpi = useKpiDashboard({ months: 6 });
  const s = kpi.data?.summary;
  const slices: Slice[] = [
    { name: "Disetujui", value: s?.pekerjaanSelesai ?? 0, color: CHART_COLORS.success },
    { name: "Pending", value: s?.pendingApproval ?? 0, color: CHART_COLORS.warning },
    { name: "Ditolak", value: s?.rejected ?? 0, color: CHART_COLORS.danger },
  ];
  return (
    <SectionCard title="Status Laporan" icon={CheckCircle2}>
      {kpi.isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : (
        <>
          <DonutWithCenter data={slices} centerLabel="total laporan" />
          <LegendBars data={slices} />
        </>
      )}
    </SectionCard>
  );
}

// ── 2d. Work Order per status (agregat real /work-orders/stats/summary) ───────
function WoStatusBreakdown() {
  const { data, isLoading } = useWorkOrderSummary();
  const byStatus = data?.byStatus ?? {};
  const slices: Slice[] = (Object.keys(WO_STATUS_LABELS) as WorkOrderStatus[])
    .map((k) => ({ name: WO_STATUS_LABELS[k], value: byStatus[k] ?? 0, key: k }))
    .filter((s) => s.value > 0)
    .map((s) => ({
      name: s.name,
      value: s.value,
      color:
        s.key === "CLOSED" || s.key === "APPROVED"
          ? CHART_COLORS.success
          : s.key === "REJECTED"
            ? CHART_COLORS.danger
            : s.key === "ON_PROGRESS"
              ? CHART_COLORS.primary
              : s.key === "DRAFT"
                ? CHART_COLORS.gray
                : CHART_COLORS.warning,
    }));
  return (
    <SectionCard title="Work Order per Status" icon={ClipboardList}>
      {isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : slices.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Belum ada work order</p>
      ) : (
        <>
          {/* Bar tunggal ter-stack (proporsi status) + rincian ber-progress-bar. */}
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {slices.map((s) => (
              <div
                key={s.name}
                style={{
                  background: s.color,
                  width: `${(s.value / Math.max(1, data?.total ?? 1)) * 100}%`,
                }}
                title={`${s.name}: ${s.value}`}
              />
            ))}
          </div>
          <LegendBars data={slices} />
        </>
      )}
    </SectionCard>
  );
}

// ── 3. Regional comparison (Top RTUPP / Top UP3 / Problem areas) ──────────────
function RollupList({
  rows,
  isLoading,
  metric = "total",
  empty,
}: {
  rows: ReportRollup[];
  isLoading: boolean;
  metric?: "total" | "rejected";
  empty: string;
}) {
  const top = rows.slice(0, 6);
  const max = Math.max(1, ...top.map((r) => (metric === "rejected" ? r.rejected : r.total)));
  return (
    <RecentList
      items={top}
      isLoading={isLoading}
      empty={empty}
      render={(r) => {
        const value = metric === "rejected" ? r.rejected : r.total;
        return (
          <div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium">{r.key}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {metric === "rejected" ? `${value} ditolak` : `${value} laporan`}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", metric === "rejected" ? "bg-red-500" : "bg-primary")}
                style={{ width: `${Math.round((value / max) * 100)}%` }}
              />
            </div>
          </div>
        );
      }}
    />
  );
}

// ── 4. Read-only report tables (pending queue / critical) ─────────────────────
function ReportTable({ rows }: { rows: HistoryItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 text-left font-semibold">ID</th>
            <th className="px-3 py-2.5 text-left font-semibold">Jenis</th>
            <th className="px-3 py-2.5 text-left font-semibold">UP3 / Lokasi</th>
            <th className="px-3 py-2.5 text-left font-semibold">Petugas</th>
            <th className="px-3 py-2.5 text-left font-semibold">Tanggal</th>
            <th className="px-3 py-2.5 text-left font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/60 transition hover:bg-muted/30">
              <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{r.reportId}</td>
              <td className="px-3 py-2.5">
                <ReportJenisBadge jenis={r.jenis} />
              </td>
              <td className="px-3 py-2.5">
                <span className="block max-w-[220px] truncate" title={getReportLocation(r)}>
                  {r.up3 || getReportLocation(r) || "—"}
                </span>
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">{r.createdBy?.name ?? "—"}</td>
              <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                {fmtDate(r.createdAt)}
              </td>
              <td className="px-3 py-2.5">
                <ReportStatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PendingQueue() {
  const { data, isLoading } = useReports({ status: "PENDING", page: 1, limit: 8 });
  const rows = (data?.items ?? []) as HistoryItem[];
  const total = data?.pagination?.total ?? rows.length;
  return (
    <SectionCard
      title="Antrian Persetujuan"
      icon={ClipboardList}
      testId="dashboard-pending-queue"
      action={
        <Badge variant="secondary" className="rounded-full px-2.5">
          {total} menunggu
        </Badge>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Tidak ada laporan menunggu validasi 🎉
        </p>
      ) : (
        <ReportTable rows={rows} />
      )}
    </SectionCard>
  );
}

function CriticalReports() {
  const { data, isLoading } = useReports({ status: "REJECTED", page: 1, limit: 8 });
  const rows = (data?.items ?? []) as HistoryItem[];
  const total = data?.pagination?.total ?? rows.length;
  return (
    <SectionCard
      title="Laporan Kritis (Ditolak)"
      icon={AlertTriangle}
      action={
        <Badge variant="outline" className="text-destructive">
          {total}
        </Badge>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Tidak ada laporan ditolak 🎉
        </p>
      ) : (
        <ReportTable rows={rows} />
      )}
    </SectionCard>
  );
}

// ── Command center ────────────────────────────────────────────────────────────
export function ManagerCommandCenter() {
  const kpi = useKpiDashboard({ months: 6 });
  const rollups = useReportRollups();

  const summary = kpi.data?.summary;
  const sla = kpi.data?.sla;
  const slaRate = sla?.slaCompletionRate;

  // Catatan link: MANAGER read-only — /validasi diblok route guard (ADMIN_TIER),
  // jadi seluruh sel laporan menuju Monitoring Laporan; SLA menuju KPI Dashboard.
  const cells: StatCell[] = [
    {
      label: "Total Laporan",
      value: summary?.totalPekerjaan,
      icon: FileText,
      accent: CHART_COLORS.primary,
      loading: kpi.isLoading,
      to: "/laporan-monitoring",
    },
    {
      label: "Pending Approval",
      value: summary?.pendingApproval,
      icon: Clock,
      accent: CHART_COLORS.warning,
      loading: kpi.isLoading,
      to: "/laporan-monitoring",
    },
    {
      label: "Approved",
      value: summary?.pekerjaanSelesai,
      sub: summary ? `${summary.completionRate}% completion` : undefined,
      icon: CheckCircle2,
      accent: CHART_COLORS.success,
      loading: kpi.isLoading,
      to: "/laporan-monitoring",
    },
    {
      label: "Rejected",
      value: summary?.rejected,
      icon: XCircle,
      accent: CHART_COLORS.danger,
      loading: kpi.isLoading,
      to: "/laporan-monitoring",
    },
    {
      label: "SLA Compliance",
      value: slaRate == null ? "—" : `${slaRate}%`,
      sub: sla?.avgApprovalHours != null ? `~${sla.avgApprovalHours} jam rata-rata` : undefined,
      icon: Timer,
      accent: CHART_COLORS.secondary,
      loading: kpi.isLoading,
      // Detail SLA kini section "KPI Dashboard" di bawah (bekas /kpi).
    },
  ];

  return (
    <div className="space-y-6">
      <StatCardGrid cells={cells} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <LaporanTrend />
        <ApprovalPerformance />
      </div>

      {/* Status laporan (read-only) + breakdown WO per status. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ManagerStatusDonut />
        <WoStatusBreakdown />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SectionCard title="Top RTUPP" icon={Building2}>
          <RollupList
            rows={rollups.topRtupp}
            isLoading={rollups.isLoading}
            empty="Belum ada data RTUPP"
          />
        </SectionCard>
        <SectionCard title="Top UP3" icon={MapPinned}>
          <RollupList
            rows={rollups.topUp3}
            isLoading={rollups.isLoading}
            empty="Belum ada data UP3"
          />
        </SectionCard>
        <SectionCard title="Wilayah Bermasalah" icon={Flame}>
          <RollupList
            rows={rollups.problemAreas}
            isLoading={rollups.isLoading}
            metric="rejected"
            empty="Tidak ada wilayah bermasalah 🎉"
          />
        </SectionCard>
      </div>

      <PendingQueue />
      <CriticalReports />

      {/* Konsolidasi rute: GI Status (global monitor) + KPI Dashboard (bekas /kpi). */}
      <GiStatusSection />
      <CollapsibleSection title="KPI Dashboard" icon={Timer} testId="kpi-section">
        <KpiDashboard />
      </CollapsibleSection>
    </div>
  );
}
