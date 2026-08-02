// VoltHub — ADMIN Command Center (enterprise "information-first" dashboard).
//
// Replaces the mobile-card grid for ADMIN with an operational monitoring center:
//   1. KPI band      — flat, bordered, tabular figures (not rounded mobile cards)
//   2. Operational   — multi-range trend  +  GIS overview preview
//   3. Validation    — pending-report queue rendered as a table (no cards)
//   4. Recent        — activity timeline
//   5. Supporting    — asset status / critical assets / device registry
//
// REAL DATA ONLY: every figure is derived from existing endpoints
// (`/dashboard/overview`, `/kpi/dashboard`, `/dashboard/stats`, reports list).
// The KPI endpoint is RTUPP-scoped server-side for ADMIN, so this view shows only
// the admin's own RTUPP — no client-side scoping needed.
import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Clock,
  CheckCircle2,
  XCircle,
  Timer,
  TrendingUp,
  Map as MapIcon,
  ClipboardList,
  Activity,
  AlertTriangle,
  Radio,
  Eye,
  Check,
  X,
  ArrowRight,
} from "lucide-react";
import type { LatLngBoundsExpression } from "leaflet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { showSuccessAuto, showError } from "@/lib/swal";
import { AssetStatusBadge } from "@/components/v2/StatusBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { CHART_COLORS } from "@/lib/chart-config";
import { StatCardGrid, type StatCell } from "@/components/StatCard";
import { SectionCard, RecentList, DeviceStatusPanel, CollapsibleSection } from "./widgets";
import { KpiDashboard } from "@/features/v2/kpi/KpiDashboard";
import { GiStatusSection } from "@/features/v2/gi-dashboard/GiStatusSection";
import {
  DonutChart,
  DonutLegend,
  DonutWithCenter,
  LegendBars,
  DualBarChart,
  TrendChart,
  type TrendPoint,
  type Slice,
} from "./charts";
import { workOrders } from "@/features/v2/work-orders/resource";
import {
  useEntityCounts,
  useAssetStatusBreakdown,
  useDeviceTypeCounts,
  useCriticalAssets,
  useOperationsTrend,
} from "./api";
import { useKpiDashboard } from "@/features/v2/kpi/api";
import { useDashboardActivity } from "./activity";
import { useGisLayers, type GisLayerId } from "@/features/v2/gis/api";
import { LAYER_META } from "@/features/v2/gis/style";
import {
  ReportLoading,
  ReportStatusBadge,
  ReportJenisBadge,
  getReportLocation,
  useReports,
  LaporanAwalDetailView,
  LaporanAkhirDetailView,
} from "@/features/report";
import type { HistoryItem } from "@/lib/api/history";
import {
  validate as validateAwal,
  getById as getAwalById,
  type LaporanAwal,
} from "@/lib/api/laporanAwal";
import {
  validate as validateAkhir,
  getById as getAkhirById,
  type LaporanAkhir,
} from "@/lib/api/laporanAkhir";

const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : "—";

// ── 2a. Operational trend (multi-range, real data) ────────────────────────────
type TrendRange = "7" | "14" | "month";

function OperationalTrend() {
  const ops = useOperationsTrend();
  const kpi = useKpiDashboard({ months: 6 });
  const [range, setRange] = useState<TrendRange>("14");

  // Merge the daily inspection + HAR series (14-day window) by index.
  const daily: TrendPoint[] = useMemo(
    () =>
      ops.inspTrend.map((p, i) => ({
        date: p.date,
        Inspeksi: Number(p.Inspeksi ?? 0),
        HAR: Number(ops.harTrend[i]?.HAR ?? 0),
      })),
    [ops.inspTrend, ops.harTrend],
  );

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
  const data = isMonthly ? monthly : range === "7" ? daily.slice(-7) : daily;
  const series = isMonthly
    ? [
        { key: "Pekerjaan", color: CHART_COLORS.primary, label: "Pekerjaan" },
        { key: "Selesai", color: CHART_COLORS.success, label: "Selesai" },
      ]
    : [
        { key: "Inspeksi", color: CHART_COLORS.primary, label: "Inspeksi" },
        { key: "HAR", color: CHART_COLORS.secondary, label: "HAR" },
      ];

  const ranges: { key: TrendRange; label: string }[] = [
    { key: "7", label: "7 Hari" },
    { key: "14", label: "14 Hari" },
    { key: "month", label: "6 Bulan" },
  ];

  return (
    <SectionCard
      title={isMonthly ? "Tren 6 Bulan" : "Laporan per Hari"}
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
                "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition",
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
      {ops.isLoading || (isMonthly && kpi.isLoading) ? (
        <Skeleton className="h-60 w-full" />
      ) : isMonthly ? (
        <TrendChart data={data} series={series} />
      ) : (
        // Harian: bar ganda Inspeksi (oranye) + HAR (biru), grid horizontal saja.
        <DualBarChart data={data} series={series} />
      )}
    </SectionCard>
  );
}

// ── 2c. Donut status laporan (disetujui/pending/ditolak, label total tengah) ──
function StatusLaporanDonut() {
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

// ── 2d. Work Order terbaru (baris div + pill status) ──────────────────────────
function RecentWorkOrders() {
  const { data, isLoading } = workOrders.useList({ page: 1, limit: 6 });
  const rows = data?.items ?? [];
  return (
    <SectionCard
      title="Work Order Terbaru"
      icon={ClipboardList}
      action={
        <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
          <Link to={"/work-order" as never}>
            Lihat semua <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      }
    >
      <RecentList
        items={rows}
        isLoading={isLoading}
        empty="Belum ada work order"
        render={(wo) => (
          <Link
            to={"/work-order/$id" as never}
            params={{ id: wo.id } as never}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-1 transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                <span className="font-mono text-xs text-muted-foreground">{wo.woNumber}</span>{" "}
                {wo.title}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {wo.location?.name ?? wo.location?.code ?? "—"}
              </div>
            </div>
            <StatusBadge status={wo.status} />
          </Link>
        )}
      />
    </SectionCard>
  );
}

// ── 2e. Alert / Perlu Perhatian (real: pending, aset kritis, WO overdue) ──────
function AttentionCard() {
  const kpi = useKpiDashboard({ months: 6 });
  const critical = useCriticalAssets();
  const pending = kpi.data?.summary?.pendingApproval ?? 0;
  const slaRate = kpi.data?.sla?.slaCompletionRate;

  const items: { text: string; to: string; severe?: boolean }[] = [];
  if (pending > 0)
    items.push({ text: `${pending} laporan menunggu validasi`, to: "/validasi" });
  if (critical.total > 0)
    items.push({ text: `${critical.total} aset kritis (Warning/Damaged)`, to: "/asset", severe: true });
  // /kpi sudah dikonsolidasi ke /dashboard — arahkan ke antrian validasi
  // (aksi yang memperbaiki SLA), bukan redirect memutar.
  if (slaRate != null && slaRate < 90)
    items.push({ text: `SLA compliance ${slaRate}% — di bawah target 90%`, to: "/validasi", severe: slaRate < 75 });

  return (
    <div className="overflow-hidden rounded-lg border border-primary/30 bg-pln-orange-light">
      <div className="flex items-center gap-2 px-4 pt-4 text-sm font-semibold text-foreground">
        <AlertTriangle className="size-4 text-primary" /> Perlu Perhatian
      </div>
      {kpi.isLoading || critical.isLoading ? (
        <div className="space-y-2 p-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Tidak ada yang perlu diperhatikan hari ini 🎉
        </p>
      ) : (
        <ul className="space-y-1 p-4 pt-3">
          {items.map((it) => (
            <li key={it.text}>
              <Link
                to={it.to as never}
                className="group flex cursor-pointer items-start gap-2 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-primary/10"
              >
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span
                  className={cn(
                    "min-w-0 flex-1",
                    it.severe ? "font-medium text-destructive" : "text-foreground",
                  )}
                >
                  {it.text}
                </span>
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 2b. GIS overview preview ──────────────────────────────────────────────────
// Leaflet is heavy, so the map is lazy-loaded — it stays out of the dashboard's
// eager chunk and only downloads when the preview actually renders.
const GisMap = lazy(() => import("@/features/v2/gis/GisMap").then((m) => ({ default: m.GisMap })));

const GIS_DEFAULT_LAYERS = new Set<GisLayerId>(
  LAYER_META.filter((l) => l.defaultOn).map((l) => l.id),
);

function GisOverview() {
  const { data: catalog } = useGisLayers();
  const fitBounds = useMemo<LatLngBoundsExpression | null>(() => {
    const b = catalog?.bbox;
    if (!b) return null;
    const [minLng, minLat, maxLng, maxLat] = b;
    return [
      [minLat, minLng],
      [maxLat, maxLng],
    ];
  }, [catalog?.bbox]);

  return (
    <SectionCard
      title="GIS Overview"
      icon={MapIcon}
      action={
        <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
          <Link to="/gis">
            Open Full GIS <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      }
    >
      <div className="relative h-64 overflow-hidden rounded-lg border border-border/60">
        <Suspense fallback={<Skeleton className="h-full w-full" />}>
          <GisMap
            className="rounded-none border-0"
            state={{
              activeLayers: GIS_DEFAULT_LAYERS,
              heatmapOn: false,
              heatmapMetric: "tickets",
              fitBounds,
            }}
          />
        </Suspense>
      </div>
    </SectionCard>
  );
}

// ── 3. Validation queue (table, not cards) ────────────────────────────────────
function ValidationQueue() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useReports({ status: "PENDING", page: 1, limit: 10 });
  const rows = (data?.items ?? []) as HistoryItem[];
  const total = data?.pagination?.total ?? rows.length;

  const [active, setActive] = useState<HistoryItem | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

  const { data: detail, isLoading: detailLoading } = useQuery<LaporanAwal | LaporanAkhir>({
    queryKey: ["report-detail", active?.jenis, active?.id],
    enabled: !!active && !rejectOpen,
    queryFn: () => (active?.jenis === "AKHIR" ? getAkhirById(active.id) : getAwalById(active!.id)),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["reports"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["v2-dashboard-overview"] });
    queryClient.invalidateQueries({ queryKey: ["v2-kpi"] });
  };

  const approve = async (item: HistoryItem) => {
    try {
      const fn = item.jenis === "AWAL" ? validateAwal : validateAkhir;
      await fn(item.id, { status: "APPROVED", notes: "Laporan disetujui" });
      showSuccessAuto("Laporan disetujui", item.reportId, 1200);
      refresh();
    } catch {
      showError("Gagal menyetujui laporan");
    }
  };

  const reject = async (item: HistoryItem, notes: string) => {
    try {
      const fn = item.jenis === "AWAL" ? validateAwal : validateAkhir;
      await fn(item.id, { status: "REJECTED", notes: notes || "Laporan ditolak" });
      showSuccessAuto("Laporan ditolak", item.reportId, 1200);
      refresh();
    } catch {
      showError("Gagal menolak laporan");
    }
  };

  return (
    <SectionCard
      title="Validation Queue"
      icon={ClipboardList}
      testId="dashboard-validation-queue"
      action={
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="rounded-full px-2.5">
            {total} menunggu
          </Badge>
          <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
            <Link to="/validasi">
              Lihat semua <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
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
                <th className="px-3 py-2.5 text-right font-semibold">Aksi</th>
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
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-8 rounded-lg p-0"
                        title="Tinjau detail"
                        aria-label="Tinjau detail"
                        data-testid="queue-detail"
                        onClick={() => setActive(r)}
                      >
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        className="size-8 rounded-lg bg-success p-0 text-success-foreground hover:bg-success/90"
                        title="Setujui"
                        aria-label="Setujui laporan"
                        data-testid="queue-approve"
                        onClick={() => approve(r)}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="size-8 rounded-lg p-0"
                        title="Tolak"
                        aria-label="Tolak laporan"
                        data-testid="queue-reject"
                        onClick={() => {
                          setActive(r);
                          setRejectOpen(true);
                        }}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Read-only detail review (approve/reject from within). */}
      <Dialog open={!!active && !rejectOpen} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>Detail {active?.reportId}</span>
              {active && <ReportJenisBadge jenis={active.jenis} />}
            </DialogTitle>
          </DialogHeader>
          {detailLoading || !detail ? (
            <ReportLoading />
          ) : active?.jenis === "AKHIR" ? (
            <LaporanAkhirDetailView laporan={detail as LaporanAkhir} />
          ) : (
            <LaporanAwalDetailView laporan={detail as LaporanAwal} />
          )}
          {active?.status === "PENDING" && (
            <DialogFooter className="sticky bottom-0 gap-2 border-t bg-background pt-3">
              <Button
                variant="destructive"
                className="rounded-lg"
                onClick={() => setRejectOpen(true)}
              >
                <X className="mr-1.5 size-4" /> Tolak
              </Button>
              <Button
                className="rounded-lg bg-success text-success-foreground hover:bg-success/90"
                onClick={() => {
                  if (active) approve(active);
                  setActive(null);
                }}
              >
                <Check className="mr-1.5 size-4" /> Setujui
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject reason. */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak Laporan {active?.reportId}</DialogTitle>
          </DialogHeader>
          <Textarea id="queue-reject-notes" placeholder="Alasan penolakan..." rows={4} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setRejectOpen(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={() => {
                const notes =
                  (document.getElementById("queue-reject-notes") as HTMLTextAreaElement)?.value ||
                  "";
                if (active) reject(active, notes);
                setRejectOpen(false);
                setActive(null);
              }}
            >
              Tolak
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ── 4. Recent activity timeline ───────────────────────────────────────────────
function ActivityTimeline() {
  const activity = useDashboardActivity();
  return (
    <SectionCard title="Recent Activities" icon={Activity} testId="dashboard-recent-activity">
      {activity.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
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

// ── Command center ────────────────────────────────────────────────────────────
export function AdminCommandCenter() {
  const counts = useEntityCounts();
  const kpi = useKpiDashboard({ months: 6 });
  const assetStatus = useAssetStatusBreakdown();
  const critical = useCriticalAssets();
  const devices = useDeviceTypeCounts();

  const summary = kpi.data?.summary;
  const sla = kpi.data?.sla;
  const slaRate = sla?.slaCompletionRate;
  // Top-border mengikuti status SLA (hijau OK / kuning waspada / merah gagal).
  const slaAccent =
    slaRate == null
      ? CHART_COLORS.gray
      : slaRate >= 90
        ? CHART_COLORS.success
        : slaRate >= 75
          ? CHART_COLORS.warning
          : CHART_COLORS.danger;

  const cells: StatCell[] = [
    {
      label: "Total Asset",
      value: counts.assets,
      icon: Boxes,
      accent: CHART_COLORS.primary,
      loading: counts.isLoading,
      to: "/asset",
    },
    {
      label: "Pending Validasi",
      value: summary?.pendingApproval,
      icon: Clock,
      accent: CHART_COLORS.warning,
      loading: kpi.isLoading,
      to: "/validasi",
    },
    {
      label: "Disetujui",
      value: summary?.pekerjaanSelesai,
      sub: summary ? `${summary.completionRate}% completion` : undefined,
      icon: CheckCircle2,
      accent: CHART_COLORS.success,
      loading: kpi.isLoading,
      to: "/laporan-monitoring",
    },
    {
      label: "Ditolak",
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
      accent: slaAccent,
      loading: kpi.isLoading,
      // Detail SLA kini section "KPI Dashboard" di halaman ini (bekas /kpi).
    },
  ];

  return (
    <div className="space-y-6">
      <StatCardGrid cells={cells} />

      {/* Charts: bar harian (2/3) + donut status laporan (1/3). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <OperationalTrend />
        <StatusLaporanDonut />
      </div>

      {/* WO terbaru + alert perlu perhatian + GIS. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <RecentWorkOrders />
        <AttentionCard />
        <GisOverview />
      </div>

      <ValidationQueue />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ActivityTimeline />

        <SectionCard title="Asset Status" icon={Boxes}>
          <DonutChart data={assetStatus.data} />
          <DonutLegend data={assetStatus.data} />
        </SectionCard>

        <SectionCard
          title="Critical Assets"
          icon={AlertTriangle}
          action={
            <Badge variant="outline" className="text-destructive">
              {critical.total}
            </Badge>
          }
        >
          <RecentList
            items={critical.items.slice(0, 6)}
            isLoading={critical.isLoading}
            empty="Tidak ada aset kritis 🎉"
            render={(a) => (
              <div className="flex items-center justify-between gap-2 text-sm">
                <Link
                  to="/asset/$id"
                  params={{ id: a.id as string }}
                  className="truncate font-medium text-primary hover:underline"
                >
                  {a.assetName}
                </Link>
                <AssetStatusBadge status={a.status} />
              </div>
            )}
          />
        </SectionCard>
      </div>

      <SectionCard title="Device Status (Registry)" icon={Radio}>
        <DeviceStatusPanel counts={devices} isLoading={devices.isLoading} />
      </SectionCard>

      {/* Konsolidasi: GI Status (bekas /gi-dashboard, hanya RTUPP1) + KPI
          Dashboard lengkap (bekas /kpi) sebagai section collapsible. */}
      <GiStatusSection />
      <CollapsibleSection title="KPI Dashboard" icon={TrendingUp} testId="kpi-section">
        <KpiDashboard />
      </CollapsibleSection>
    </div>
  );
}
