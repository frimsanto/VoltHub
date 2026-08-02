// VoltHub — Enterprise KPI Dashboard.
// 10 executive/operational widgets built entirely from real report data
// (laporan_awal + laporan_akhir), served by one aggregation endpoint. Handles
// loading (skeletons), error (retry), and empty states; layout is fully
// responsive (2→3→5 column card grids, stacking chart rows).
import {
  ClipboardList,
  CheckCircle2,
  Loader2,
  Clock,
  XCircle,
  Gauge,
  TrendingUp,
  Users,
  Trophy,
  UserRound,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CHART_COLORS } from "@/lib/chart-config";
import { StatCard, SectionCard } from "@/features/v2/dashboard/widgets";
import { TrendChart, BarMini } from "@/features/v2/dashboard/charts";
import { useKpiDashboard, type KpiDashboardData } from "./api";

/** Error panel with retry — used when the aggregation request fails. */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <div>
        <p className="font-medium">Gagal memuat KPI</p>
        <p className="text-sm text-muted-foreground">
          Terjadi kesalahan saat mengambil data dashboard. Coba lagi.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-2 size-4" /> Muat ulang
      </Button>
    </div>
  );
}

/** Widget 10 — SLA completion gauge card. */
function SlaCard({ sla, loading }: { sla?: KpiDashboardData["sla"]; loading: boolean }) {
  const rate = sla?.slaCompletionRate ?? 0;
  const tone = rate >= 90 ? "text-emerald-600 dark:text-emerald-400" : rate >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  return (
    <SectionCard title="SLA Completion Rate" icon={Gauge}>
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <span className={`text-4xl font-bold tabular-nums ${tone}`}>{rate}%</span>
            <span className="pb-1 text-sm text-muted-foreground">
              dalam {sla?.slaWindowHours ?? 0} jam
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-current transition-all"
              style={{ width: `${Math.min(rate, 100)}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {sla?.withinSla ?? 0} dari {sla?.finalized ?? 0} pekerjaan disetujui tepat waktu
            {sla?.avgApprovalHours != null && (
              <> · rata-rata {sla.avgApprovalHours} jam</>
            )}
          </p>
        </div>
      )}
    </SectionCard>
  );
}

export function KpiDashboard() {
  const { data, isLoading, isError, refetch, isFetching } = useKpiDashboard();

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const s = data?.summary;
  const teams = data?.teamPerformance ?? [];
  const topPetugas = data?.topPetugas ?? [];

  const trendData = (data?.monthlyTrend ?? []).map((p) => ({
    date: p.label,
    Total: p.total,
    Selesai: p.selesai,
  }));

  // Team performance bar (completed jobs per team, top 8 for legibility).
  const teamBars = teams
    .slice(0, 8)
    .map((t) => ({ name: t.teamCode || t.teamName, value: t.selesai }));

  return (
    <div className="space-y-6">
      {/* Scope + refresh */}
      <div className="flex items-center justify-end gap-3">
        {data && (
          <span className="text-xs text-muted-foreground">
            Cakupan: {data.scope.level === "GLOBAL" ? "Seluruh organisasi" : "RTUPP Anda"}
          </span>
        )}
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Widgets 1–5 — headline summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={ClipboardList}
          label="Total Pekerjaan"
          value={s?.totalPekerjaan}
          loading={isLoading}
          tone="text-blue-600 dark:text-blue-400 bg-blue-500/10"
        />
        <StatCard
          icon={CheckCircle2}
          label="Pekerjaan Selesai"
          value={s?.pekerjaanSelesai}
          loading={isLoading}
          tone="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
        />
        <StatCard
          icon={Loader2}
          label="Pekerjaan Berjalan"
          value={s?.pekerjaanBerjalan}
          loading={isLoading}
          tone="text-indigo-600 dark:text-indigo-400 bg-indigo-500/10"
        />
        <StatCard
          icon={Clock}
          label="Pending Approval"
          value={s?.pendingApproval}
          loading={isLoading}
          tone="text-amber-600 dark:text-amber-400 bg-amber-500/10"
        />
        <StatCard
          icon={XCircle}
          label="Rejected"
          value={s?.rejected}
          loading={isLoading}
          tone="text-red-600 dark:text-red-400 bg-red-500/10"
        />
      </div>

      {/* Widget 7 (Monthly Trend) + Widget 10 (SLA) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Monthly Trend (Pekerjaan)" icon={TrendingUp} className="lg:col-span-2">
          {isLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : (
            <TrendChart
              data={trendData}
              series={[
                { key: "Total", color: CHART_COLORS.primary, label: "Total" },
                { key: "Selesai", color: CHART_COLORS.success, label: "Selesai" },
              ]}
            />
          )}
        </SectionCard>
        <SlaCard sla={data?.sla} loading={isLoading} />
      </div>

      {/* Widget 6 (Team Performance) + Widget 8 (Top Team) + Widget 9 (Top Petugas) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Team Performance (Selesai)" icon={Users} className="lg:col-span-2">
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : teamBars.length === 0 ? (
            <p className="flex h-52 items-center justify-center text-sm text-muted-foreground">
              Belum ada data tim.
            </p>
          ) : (
            <>
              <BarMini data={teamBars} height={200} color={CHART_COLORS.primary} />
              <ul className="mt-3 divide-y divide-border">
                {teams.slice(0, 5).map((t) => (
                  <li key={t.teamId} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {t.teamName}
                      {t.teamCode && (
                        <span className="ml-1 text-muted-foreground">({t.teamCode})</span>
                      )}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {t.selesai}/{t.total} · {t.completionRate}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>

        <div className="space-y-4">
          {/* Widget 8 — Top Team */}
          <SectionCard title="Top Team" icon={Trophy}>
            {isLoading ? (
              <Skeleton className="h-14 w-full" />
            ) : data?.topTeam ? (
              <div>
                <p className="font-medium">{data.topTeam.teamName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.topTeam.selesai} selesai dari {data.topTeam.total} pekerjaan ·{" "}
                  {data.topTeam.completionRate}%
                </p>
              </div>
            ) : (
              <p className="py-3 text-sm text-muted-foreground">Belum ada data tim.</p>
            )}
          </SectionCard>

          {/* Widget 9 — Top Petugas */}
          <SectionCard title="Top Petugas" icon={UserRound}>
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : topPetugas.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">Belum ada data petugas.</p>
            ) : (
              <ul className="divide-y divide-border">
                {topPetugas.map((p, i) => (
                  <li key={p.userId} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
                        {i + 1}
                      </span>
                      <span className="truncate font-medium">{p.name}</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {p.selesai}/{p.total}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
