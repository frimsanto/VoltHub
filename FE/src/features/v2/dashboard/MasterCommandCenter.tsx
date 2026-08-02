// VoltHub — MASTER Command Center (system-owner governance dashboard).
//
// Layout konsolidasi (information-first, 3-kolom grid):
//   Row 1: 5 StatCard  — Users / Assets / RTUPP / UP3 / Laporan (org-wide)
//   Row 2: Tren 14 hari (2/3)  +  Asset Distribution donut (1/3)
//   Row 3: Recent Registrations (1/2)  +  Audit Activities (1/2)
//   Row 4: Import Monitoring — full width, collapsible
//   + section GI Status (RTUPP1/global) dan KPI Dashboard (bekas /kpi),
//     keduanya collapsible — konsolidasi rute /gi-dashboard & /kpi.
//
// REAL DATA ONLY. Metrics with no real source are intentionally OMITTED rather
// than faked — notably "Login Activity", which has no backend field today.
import {
  Users,
  Boxes,
  Network,
  MapPinned,
  FileText,
  UserPlus,
  Activity,
  FileBarChart2,
  TrendingUp,
  Upload,
  AlertTriangle,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { V2_ROLE_LABELS, toV2Role } from "@/lib/v2/rbac";
import { CHART_COLORS } from "@/lib/chart-config";
import { StatCardGrid, type StatCell } from "@/components/StatCard";
import { SectionCard, RecentList, CollapsibleSection } from "./widgets";
import {
  DonutChart,
  DonutLegend,
  DualBarChart,
  BarMini,
  type TrendPoint,
} from "./charts";
import {
  useEntityCounts,
  useAssetStatusBreakdown,
  useImportStats,
  useReportRollups,
  useOperationsTrend,
} from "./api";
import { useDashboardActivity } from "./activity";
import { useUsers, useRtuppDropdown } from "@/features/v2/admin/hooks";
import { useKpiDashboard } from "@/features/v2/kpi/api";
import { KpiDashboard } from "@/features/v2/kpi/KpiDashboard";
import { GiStatusSection } from "@/features/v2/gi-dashboard/GiStatusSection";

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

// ── Row 3a. Recent user registrations ─────────────────────────────────────────
function RecentRegistrations() {
  const { data, isLoading } = useUsers();
  const recent = [...(data ?? [])]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 6);
  return (
    <SectionCard
      title="Recent Registrations"
      icon={UserPlus}
      action={
        <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
          <Link to="/users">
            Kelola <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      }
    >
      <RecentList
        items={recent}
        isLoading={isLoading}
        empty="Belum ada user"
        render={(u) => (
          <div className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{u.name}</div>
              <div className="truncate text-xs text-muted-foreground">{u.email}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge variant="secondary" className="text-[10px]">
                {V2_ROLE_LABELS[toV2Role(u.role)]}
              </Badge>
              <span className="text-[11px] text-muted-foreground">{fmtDate(u.createdAt)}</span>
            </div>
          </div>
        )}
      />
    </SectionCard>
  );
}

// ── Row 3b. Audit activities (timeline) ───────────────────────────────────────
function AuditActivities() {
  const activity = useDashboardActivity();
  return (
    <SectionCard title="Audit Activities" icon={Activity} testId="dashboard-recent-activity">
      {activity.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="shimmer h-10 w-full" />
          ))}
        </div>
      ) : activity.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Belum ada aktivitas</p>
      ) : (
        <ol className="relative ml-1 space-y-4 border-l border-border/70 pl-5">
          {activity.items.map((a, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[1.46rem] top-1 size-2.5 rounded-full border-2 border-card bg-primary" />
              <div className="text-sm">
                <span className="font-medium">{a.user}</span> {a.action}
              </div>
              <div className="text-xs text-muted-foreground">
                {a.entity} • {a.time}
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

// ── Row 2a. Tren 14 hari (Inspeksi + HAR, seluruh RTUPP) ──────────────────────
function Trend14Days() {
  const ops = useOperationsTrend();
  const data: TrendPoint[] = useMemo(
    () =>
      ops.inspTrend.map((p, i) => ({
        date: p.date,
        Inspeksi: Number(p.Inspeksi ?? 0),
        HAR: Number(ops.harTrend[i]?.HAR ?? 0),
      })),
    [ops.inspTrend, ops.harTrend],
  );
  return (
    <SectionCard title="Tren 14 Hari" icon={TrendingUp} className="lg:col-span-2">
      {ops.isLoading ? (
        <Skeleton className="shimmer h-60 w-full" />
      ) : (
        <DualBarChart
          data={data}
          series={[
            { key: "Inspeksi", color: CHART_COLORS.primary, label: "Inspeksi" },
            { key: "HAR", color: CHART_COLORS.secondary, label: "HAR" },
          ]}
        />
      )}
    </SectionCard>
  );
}

// ── Row 4. Import monitoring (full width, collapsible) ────────────────────────
function ImportMonitoring() {
  const imports = useImportStats();
  return (
    <CollapsibleSection
      title="Import Monitoring"
      icon={FileBarChart2}
      action={
        <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
          <Link to="/imports">
            Lihat semua <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <BarMini data={imports.byStatus} height={180} />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>
              Total job:{" "}
              <strong className="text-foreground tabular-nums">{imports.total}</strong>
            </span>
            <span>
              Baris terimpor:{" "}
              <strong className="text-foreground tabular-nums">{imports.rowsImported}</strong>
            </span>
          </div>
        </div>
        <RecentList
          items={imports.recent.slice(0, 5)}
          isLoading={imports.isLoading}
          empty="Belum ada import"
          render={(r) => (
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <Upload className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{r.fileName}</span>
              </div>
              <Badge
                variant={r.status === "FAILED" ? "destructive" : "secondary"}
                className="shrink-0 text-[10px]"
              >
                {r.status}
              </Badge>
            </div>
          )}
        />
      </div>
    </CollapsibleSection>
  );
}

// ── Command center ────────────────────────────────────────────────────────────
export function MasterCommandCenter() {
  const counts = useEntityCounts();
  const users = useUsers();
  const rtupps = useRtuppDropdown();
  const rollups = useReportRollups();
  const kpi = useKpiDashboard({ months: 6 });
  const assetStatus = useAssetStatusBreakdown();
  const imports = useImportStats();
  const ops = useOperationsTrend();

  // Sparkline Laporan = total laporan (Inspeksi+HAR) per hari, 14 hari (real).
  const laporanTrend = ops.inspTrend.map(
    (p, i) => Number(p.Inspeksi ?? 0) + Number(ops.harTrend[i]?.HAR ?? 0),
  );

  const cells: StatCell[] = [
    {
      label: "Total Users",
      value: users.data?.length,
      icon: Users,
      accent: CHART_COLORS.purple,
      loading: users.isLoading,
      to: "/users",
    },
    {
      label: "Total Assets",
      value: counts.assets,
      icon: Boxes,
      accent: CHART_COLORS.primary,
      loading: counts.isLoading,
      to: "/asset",
    },
    {
      label: "Total RTUPP",
      value: rtupps.data?.length,
      icon: Network,
      accent: CHART_COLORS.secondary,
      loading: rtupps.isLoading,
      to: "/rtupp",
    },
    {
      label: "Total UP3",
      value: rollups.distinctUp3,
      sub: "terdata di laporan",
      icon: MapPinned,
      accent: CHART_COLORS.success,
      loading: rollups.isLoading,
      to: "/gardu",
    },
    {
      label: "Total Laporan",
      value: kpi.data?.summary?.totalPekerjaan,
      icon: FileText,
      accent: CHART_COLORS.primary,
      loading: kpi.isLoading,
      to: "/laporan-monitoring",
      trend: laporanTrend,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Row 1 — KPI band */}
      <StatCardGrid cells={cells} />

      {/* Row 2 — tren 14 hari (2/3) + asset distribution (1/3) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Trend14Days />
        <SectionCard title="Asset Distribution" icon={Boxes}>
          {assetStatus.isLoading ? (
            <Skeleton className="shimmer h-52 w-full" />
          ) : (
            <>
              <DonutChart data={assetStatus.data} height={180} />
              <DonutLegend data={assetStatus.data} />
            </>
          )}
        </SectionCard>
      </div>

      {/* Row 3 — recent users (1/2) + audit activities (1/2) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentRegistrations />
        <AuditActivities />
      </div>

      {/* Row 4 — import monitoring, full width, collapsible */}
      <ImportMonitoring />

      {/* Konsolidasi: GI Status (bekas /gi-dashboard) + KPI (bekas /kpi). */}
      <GiStatusSection />
      <CollapsibleSection title="KPI Dashboard" icon={BarChart3} testId="kpi-section">
        <KpiDashboard />
      </CollapsibleSection>

      {/* Failed-import alert strip (real, only when there are failures). */}
      {!imports.isLoading && imports.failedCount > 0 && (
        <div className="flex items-center gap-2 rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            {imports.failedCount} job import gagal —{" "}
            <Link to="/imports" className="font-semibold underline">
              tinjau sekarang
            </Link>
          </span>
        </div>
      )}
    </div>
  );
}
