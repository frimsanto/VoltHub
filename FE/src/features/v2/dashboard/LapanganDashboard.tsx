// VoltHub — Dashboard Lapangan (management view, konsolidasi).
//
// Bekas isi /lapangan (FieldOverview + AdminDashboard penuh) menduplikasi
// AdminCommandCenter di /dashboard. Halaman ini kini fokus ke apa yang sedang
// terjadi di lapangan SEKARANG:
//   Row 1: WO Aktif | Pending Approval | Selesai Bulan Ini | SLA Rate
//   Row 2: Tren Laporan 14 hari (2/3) + Leaderboard tim (1/3)
//   Row 3: antrian laporan PENDING (read-only, full width)
// REAL DATA ONLY — /dashboard/overview, /kpi/dashboard, /dashboard/leaderboard,
// dan daftar laporan PENDING dari endpoint reports yang sudah ada.
import { Link } from "@tanstack/react-router";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  Timer,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useV2Role } from "@/lib/v2/rbac";
import { CHART_COLORS } from "@/lib/chart-config";
import { StatCard } from "@/components/StatCard";
import { SectionCard } from "./widgets";
import { DualBarChart, type TrendPoint } from "./charts";
import { Leaderboard } from "./Leaderboard";
import { useMonthlyOps, useTicketCounts, useOperationsTrend } from "./api";
import { useKpiDashboard } from "@/features/v2/kpi/api";
import {
  ReportStatusBadge,
  ReportJenisBadge,
  getReportLocation,
  useReports,
} from "@/features/report";
import type { HistoryItem } from "@/lib/api/history";

const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : "—";

// ── Row 2a. Tren laporan 14 hari (Inspeksi + HAR per hari) ────────────────────
function TrenLaporan14Hari() {
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
    <SectionCard title="Tren Laporan 14 Hari" icon={TrendingUp} className="lg:col-span-2">
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

// ── Row 3. Antrian laporan PENDING (read-only) ────────────────────────────────
// Aksi approve/reject tetap di /validasi (ADMIN) — di sini murni monitoring,
// sehingga aman juga untuk MANAGER/MASTER (read-only).
function PendingQueueTable() {
  const role = useV2Role();
  const { data, isLoading } = useReports({ status: "PENDING", page: 1, limit: 10 });
  const rows = (data?.items ?? []) as HistoryItem[];
  const total = data?.pagination?.total ?? rows.length;
  // /validasi diblok route guard untuk MANAGER — arahkan mereka ke monitoring.
  const actionTo = role === "ADMIN" ? "/validasi" : "/laporan-monitoring";

  return (
    <SectionCard
      title="Laporan Menunggu Approval"
      icon={ClipboardList}
      testId="lapangan-pending-queue"
      action={
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="rounded-full px-2.5">
            {total} menunggu
          </Badge>
          <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
            <Link to={actionTo as never}>
              {role === "ADMIN" ? "Buka Approval" : "Lihat semua"}{" "}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="shimmer h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Tidak ada laporan menunggu approval 🎉
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
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60 transition hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">{r.reportId}</td>
                  <td className="px-3 py-2.5">
                    <ReportJenisBadge jenis={r.jenis} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block max-w-55 truncate" title={getReportLocation(r)}>
                      {r.up3 || getReportLocation(r) || "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{r.createdBy?.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
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
      )}
    </SectionCard>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function LapanganDashboard() {
  const ticketCounts = useTicketCounts();
  const monthly = useMonthlyOps();
  const kpi = useKpiDashboard({ months: 6 });

  const summary = kpi.data?.summary;
  const slaRate = kpi.data?.sla?.slaCompletionRate;
  const slaAccent =
    slaRate == null
      ? CHART_COLORS.gray
      : slaRate >= 90
        ? CHART_COLORS.success
        : slaRate >= 75
          ? CHART_COLORS.warning
          : CHART_COLORS.danger;

  const selesaiBulanIni = monthly.isLoading
    ? undefined
    : monthly.inspectionThisMonth + monthly.harThisMonth;

  return (
    <div className="space-y-4">
      {/* Row 1 — 4 kartu KPI lapangan */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="WO Aktif"
          value={ticketCounts.open}
          icon={<ClipboardList className="size-[13px]" />}
          accentColor={CHART_COLORS.primary}
          loading={ticketCounts.isLoading}
          to="/work-order"
        />
        <StatCard
          label="Pending Approval"
          value={summary?.pendingApproval}
          icon={<Clock className="size-[13px]" />}
          accentColor={CHART_COLORS.warning}
          loading={kpi.isLoading}
          to="/laporan-monitoring"
        />
        <StatCard
          label="Selesai Bulan Ini"
          value={selesaiBulanIni}
          sub="Inspeksi + HAR bulan berjalan"
          icon={<CheckCircle2 className="size-[13px]" />}
          accentColor={CHART_COLORS.success}
          loading={monthly.isLoading}
          to="/laporan-monitoring"
        />
        <StatCard
          label="SLA Rate"
          value={slaRate == null ? "—" : `${slaRate}%`}
          icon={<Timer className="size-[13px]" />}
          accentColor={slaAccent}
          loading={kpi.isLoading}
        />
      </div>

      {/* Row 2 — tren 14 hari (2/3) + leaderboard tim (1/3) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TrenLaporan14Hari />
        <Leaderboard />
      </div>

      {/* Row 3 — antrian pending, full width */}
      <PendingQueueTable />
    </div>
  );
}
