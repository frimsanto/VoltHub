import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, MapPin, Radio, Zap, Users, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useEffect, useState } from "react";
import { requireRole } from "@/lib/route-guards";
import {
  ReportEmptyState,
  ReportStatusBadge,
  getReportTitle,
  getReportLocation,
  useReports,
} from "@/features/report";

export const Route = createFileRoute("/_app/monitoring")({
  beforeLoad: () => {
    requireRole(["admin", "superadmin"]);
  },
  component: Monitoring,
  head: () => ({ meta: [{ title: "Monitoring — VoltHub" }] }),
});

function Monitoring() {
  const [pulse, setPulse] = useState<{ t: string; v: number }[]>([]);

  const { data: response, isLoading: loading } = useReports({
    jenis: "ALL",
    status: "PENDING",
    page: 1,
    limit: 6,
  });
  // Tetap `any[]` agar akses field lintas-jenis (petugas/pelaksana/team) sama persis seperti sebelumnya.
  const activeWorks = (response?.items ?? []) as any[];

  useEffect(() => {
    const id = setInterval(() => {
      setPulse((p) => [...p.slice(1), { t: String(Date.now()), v: 0 }]);
    }, 1500);
    return () => clearInterval(id);
  }, []);

  const stats = {
    activePersonnel: 0,
    onlineTeams: 0,
    activeWorks: activeWorks.length,
    incidentsToday: 0,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Monitoring"
        description="Pantau aktivitas tim lapangan secara realtime."
        actions={
          <Badge className="bg-success/15 text-success border-success/30 border gap-1.5">
            <span className="size-1.5 rounded-full bg-success animate-pulse" />
            Live
          </Badge>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: Users,
            label: "Petugas Aktif",
            v: stats.activePersonnel,
            sub: "dari database",
            color: "text-info bg-info/10",
          },
          {
            icon: Radio,
            label: "Tim Online",
            v: stats.onlineTeams,
            sub: "RTUPP aktif",
            color: "text-success bg-success/10",
          },
          {
            icon: Zap,
            label: "Pekerjaan Aktif",
            v: stats.activeWorks,
            sub: "laporan pending",
            color: "text-pln-blue bg-primary/10",
          },
          {
            icon: AlertTriangle,
            label: "Insiden Hari Ini",
            v: stats.incidentsToday,
            sub: "tertangani",
            color: "text-warning bg-warning/15",
          },
        ].map((s) => (
          <Card key={s.label} className="rounded-2xl shadow-soft border-border/60">
            <CardContent className="p-5">
              <div
                className={`size-10 rounded-xl flex items-center justify-center mb-3 ${s.color}`}
              >
                <s.icon className="size-5" />
              </div>
              <div className="text-3xl font-bold tabular-nums">{s.v}</div>
              <div className="text-xs font-semibold mt-1">{s.label}</div>
              <div className="text-[11px] text-muted-foreground">{s.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 rounded-2xl shadow-soft border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="size-4 text-success" /> Aktivitas Realtime
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              refresh 1.5s
            </Badge>
          </CardHeader>
          <CardContent>
            {pulse.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={pulse}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="t" hide />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke="var(--color-pln-blue)"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-muted-foreground">
                Menunggu data...
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-soft border-border/60">
          <CardHeader>
            <CardTitle className="text-base">RTUPP Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ReportEmptyState
              title="Belum ada data RTUPP"
              description="Data RTUPP akan muncul saat tersedia"
              className="py-8"
            />
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="size-4 text-info" /> Pekerjaan Sedang Berlangsung
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {loading ? (
            <div className="col-span-full py-8 text-center text-muted-foreground">
              Memuat data...
            </div>
          ) : activeWorks.length === 0 ? (
            <ReportEmptyState
              title="Tidak ada pekerjaan aktif"
              description="Laporan yang menunggu validasi akan muncul di sini"
              className="col-span-full py-8"
            />
          ) : (
            activeWorks.slice(0, 6).map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-border/60 p-4 hover:shadow-soft transition gradient-pln-soft"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-muted-foreground">{r.reportId}</span>
                  <ReportStatusBadge status={r.status} />
                </div>
                <div className="font-semibold text-sm leading-snug">{getReportTitle(r)}</div>
                <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                  <MapPin className="size-3" /> {getReportLocation(r)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  👷 {r.petugas || r.pelaksana || "-"} • {r.team || "-"}
                </div>
                <Button size="sm" variant="outline" className="w-full mt-3 rounded-lg">
                  Detail Pekerjaan
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
