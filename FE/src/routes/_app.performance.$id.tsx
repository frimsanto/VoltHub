import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useMemo } from "react";
import { Loader2, Activity, TrendingUp, Gauge, RadioTower } from "lucide-react";
import { Button } from "@/components/ui/button";
import { locationLabel } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/v2/PageHeader";
import { InfoGrid } from "@/components/v2/InfoGrid";
import { RcStatusBadge } from "@/components/v2/StatusBadge";
import { TrendChart } from "@/features/v2/dashboard/charts";
import { CHART_COLORS } from "@/lib/chart-config";
import {
  performance,
  usePerformanceSummary,
  availabilityPct,
  rcStatusForDate,
  buildPerfTrends,
} from "@/features/v2/performance/resource";

export const Route = createFileRoute("/_app/performance/$id")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: PerformanceDetailPage,
  head: () => ({ meta: [{ title: "Detail Performance — VoltHub" }] }),
});

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "—";

function PerformanceDetailPage() {
  const { id } = useParams({ from: "/_app/performance/$id" });
  const { data: rec, isLoading, isError, refetch } = performance.useOne(id);

  const locationId = rec?.locationId;
  // Gardu series for the trend/history sections (newest-first from the API).
  const seriesQ = performance.useList(
    { page: 1, limit: 60, locationId },
    { enabled: !!locationId },
  );
  const summaryQ = usePerformanceSummary({ locationId }, { enabled: !!locationId });

  const records = seriesQ.data?.items ?? [];
  const trends = useMemo(() => buildPerfTrends(records), [records]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
      </div>
    );
  }
  if (isError || !rec) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-destructive">Gagal memuat data performance.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  const locName = rec.location
    ? locationLabel(rec.location.code, rec.location.name)
    : rec.locationId;
  const rc = rcStatusForDate(rec.locationId, rec.performanceDate);
  const summary = summaryQ.data;

  return (
    <div>
      <PageHeader
        title={`Performance ${fmtDate(rec.performanceDate)}`}
        description={locName}
        backTo="/performance"
      />

      {/* A. Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4" /> Ringkasan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InfoGrid
            items={[
              {
                label: "Gardu",
                value: rec.location ? (
                  <Link
                    className="text-primary hover:underline"
                    to="/gardu/$id" params={{ id: rec.locationId as string }}
                  >
                    {locName}
                  </Link>
                ) : (
                  locName
                ),
              },
              { label: "Rata-rata Availability", value: summary ? `${summary.successRate}%` : "—" },
              {
                label: "Rata-rata Skor",
                value: summary?.avgScore != null ? Math.round(summary.avgScore * 10) / 10 : "—",
              },
              { label: "Total Hari Terekam", value: summary?.total ?? records.length },
              { label: "Hari Berhasil", value: summary?.berhasil ?? "—" },
              { label: "Hari Gagal", value: summary?.gagal ?? "—" },
            ]}
          />
        </CardContent>
      </Card>

      {/* B. Daily Metrics */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="size-4" /> Metrik Harian
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InfoGrid
            items={[
              { label: "Tanggal", value: fmtDate(rec.performanceDate) },
              {
                label: "Status",
                value:
                  rec.performanceStatus === 1 ? (
                    <span className="font-medium text-green-600 dark:text-green-400">Berhasil</span>
                  ) : (
                    <span className="font-medium text-red-600 dark:text-red-400">Gagal</span>
                  ),
              },
              { label: "Availability", value: `${availabilityPct(rec)}%` },
              { label: "RC Status", value: <RcStatusBadge status={rc} /> },
              { label: "Performance Score", value: rec.score != null ? rec.score : "—" },
              { label: "Dibuat", value: fmtDate(rec.createdAt) },
            ]}
          />
        </CardContent>
      </Card>

      {/* C. Historical Trend (score) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4" /> Tren Historis (Skor)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart
            data={trends}
            series={[{ key: "Skor", color: "var(--color-chart-1)", label: "Performance Score" }]}
          />
        </CardContent>
      </Card>

      {/* D. Availability Trend */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4" /> Tren Availability
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart
            data={trends}
            series={[{ key: "Availability", color: CHART_COLORS.success, label: "Availability %" }]}
          />
        </CardContent>
      </Card>

      {/* E. RC History */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RadioTower className="size-4" /> Riwayat RC
          </CardTitle>
        </CardHeader>
        <CardContent>
          {seriesQ.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Memuat riwayat…</p>
          ) : records.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada riwayat.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>RC Status</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead className="text-right">Skor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{fmtDate(r.performanceDate)}</TableCell>
                    <TableCell>
                      <RcStatusBadge status={rcStatusForDate(r.locationId, r.performanceDate)} />
                    </TableCell>
                    <TableCell>{availabilityPct(r)}%</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.score != null ? r.score : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
