import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  RadioTower,
  ArrowUpCircle,
  ArrowDownCircle,
  Activity,
  Building2,
  GitBranch,
  AlertTriangle,
  Ticket,
  Maximize2,
  Minimize2,
  RefreshCw,
} from "lucide-react";
import { requireV2Role, MASTER_ONLY_ROLES } from "@/lib/v2/route-guards";
import { DonutChart, type Slice } from "@/features/v2/dashboard/charts";
import { CHART_COLORS } from "@/lib/chart-config";
import { useScadaRtuSummary, useGarduOverview, useTicketCounts } from "@/features/v2/dashboard/api";

// Pusat Monitoring (control-room wall) — MASTER only. Built for a large display:
// dark high-contrast theme, oversized glanceable tiles, a live "heartbeat", and
// fullscreen. The RTU UP/DOWN figures are genuinely live (polled every 10s from
// the SCADA import); the registry/ticket band is refreshed every 20s.
export const Route = createFileRoute("/_app/wall")({
  beforeLoad: () => requireV2Role(MASTER_ONLY_ROLES),
  component: MonitoringWall,
  head: () => ({ meta: [{ title: "Pusat Monitoring — VoltHub" }] }),
});

const RTU_POLL_MS = 10_000;
const REGISTRY_POLL_MS = 20_000;

function MonitoringWall() {
  const rootRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const scada = useScadaRtuSummary(RTU_POLL_MS);
  const o = useGarduOverview();
  const tickets = useTicketCounts();

  // Keep the registry/ticket band fresh on the wall (its source query is shared
  // and otherwise cached 60s) by invalidating it on a slower beat.
  useEffect(() => {
    const id = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["v2-dashboard-overview"] });
    }, REGISTRY_POLL_MS);
    return () => clearInterval(id);
  }, [qc]);

  // "Updated Xs ago" heartbeat — ticks every second, resets when live data lands.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const lastUpdated = scada.dataUpdatedAt || now;
  const agoSec = Math.max(0, Math.round((now - lastUpdated) / 1000));

  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const onFs = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  };

  const s = scada.data;
  const up = s?.up ?? 0;
  const down = s?.down ?? 0;
  const avail = s?.availability;

  const rtuDonut: Slice[] = [
    { name: "UP", value: up, color: CHART_COLORS.success },
    { name: "DOWN", value: down, color: CHART_COLORS.danger },
  ];
  const rcDonut: Slice[] = [
    { name: "Inscan", value: o.rcInscan ?? 0, color: CHART_COLORS.success },
    { name: "OOP", value: o.rcOop ?? 0, color: CHART_COLORS.danger },
  ];

  return (
    <div ref={rootRef} className="min-h-screen bg-slate-950 text-slate-100 -m-4 p-6 sm:-m-6 sm:p-8">
      {/* Header band */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <RadioTower className="h-8 w-8 text-cyan-400" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">PUSAT MONITORING</h1>
            <p className="text-sm text-slate-400">VoltHub · Telecommunication SCADA</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="font-mono text-2xl font-semibold tabular-nums sm:text-3xl">
              {clock.toLocaleTimeString("id-ID", { hour12: false })}
            </div>
            <div className="text-xs text-slate-400">
              {clock.toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
          </div>
          <LiveBadge agoSec={agoSec} fetching={scada.isFetching} />
          <button
            onClick={toggleFs}
            className="rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-slate-300 transition hover:bg-slate-800"
            title={isFs ? "Keluar layar penuh" : "Layar penuh"}
          >
            {isFs ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Hero — live RTU state */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <HeroTile
          icon={ArrowUpCircle}
          label="RTU ONLINE (UP)"
          value={up}
          accent="text-emerald-400"
          ring="ring-emerald-500/30"
          loading={scada.isLoading}
        />
        <HeroTile
          icon={ArrowDownCircle}
          label="RTU OFFLINE (DOWN)"
          value={down}
          accent="text-rose-400"
          ring="ring-rose-500/30"
          loading={scada.isLoading}
          pulse={down > 0}
        />
        <HeroTile
          icon={Activity}
          label="AVAILABILITY"
          value={avail != null ? `${avail}%` : "—"}
          accent={availabilityTone(avail)}
          ring="ring-cyan-500/30"
          loading={scada.isLoading}
        />
      </div>

      {/* Secondary registry band */}
      <div className="mt-5 grid grid-cols-2 gap-5 lg:grid-cols-4">
        <MiniTile
          icon={Building2}
          label="Total Gardu"
          value={o.totalGardu}
          loading={o.isLoading}
          accent="text-sky-400"
        />
        <MiniTile
          icon={GitBranch}
          label="Total Penyulang"
          value={o.totalPenyulang}
          loading={o.isLoading}
          accent="text-cyan-400"
        />
        <MiniTile
          icon={AlertTriangle}
          label="RC OOP"
          value={o.rcOop}
          loading={o.isLoading}
          accent="text-rose-400"
        />
        <MiniTile
          icon={Ticket}
          label="Work Order Terbuka"
          value={tickets.open}
          loading={tickets.isLoading}
          accent="text-amber-400"
        />
      </div>

      {/* Charts + problem list */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <WallCard title="Status RTU (SCADA)">
          <DonutChart data={rtuDonut} height={240} />
          <DonutRow data={rtuDonut} />
        </WallCard>
        <WallCard title="Status RC">
          <DonutChart data={rcDonut} height={240} />
          <DonutRow data={rcDonut} />
        </WallCard>
        <WallCard title="Gardu Bermasalah">
          {o.isLoading ? (
            <p className="py-10 text-center text-sm text-slate-500">Memuat…</p>
          ) : o.problems.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Tidak ada gardu bermasalah 🎉
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {o.problems.slice(0, 7).map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">
                    {g.name}
                  </span>
                  <span className="flex items-center gap-2">
                    {g.openTickets > 0 && (
                      <span className="text-xs text-slate-400">{g.openTickets} tiket</span>
                    )}
                    <span className="rounded bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-400">
                      {g.operational}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </WallCard>
      </div>
    </div>
  );
}

function availabilityTone(v: number | null | undefined): string {
  if (v == null) return "text-slate-400";
  if (v >= 95) return "text-emerald-400";
  if (v >= 85) return "text-amber-400";
  return "text-rose-400";
}

function LiveBadge({ agoSec, fetching }: { agoSec: number; fetching: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      <div className="leading-tight">
        <div className="text-xs font-semibold text-emerald-400">LIVE</div>
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          {fetching && <RefreshCw className="h-3 w-3 animate-spin" />}
          {agoSec < 2 ? "baru saja" : `${agoSec}s lalu`}
        </div>
      </div>
    </div>
  );
}

function HeroTile({
  icon: Icon,
  label,
  value,
  accent,
  ring,
  loading,
  pulse,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  accent: string;
  ring: string;
  loading?: boolean;
  pulse?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900/70 p-6 ring-1 ${ring} ${pulse ? "animate-pulse" : ""}`}
    >
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className={`h-5 w-5 ${accent}`} />
        <span className="text-sm font-medium tracking-wide">{label}</span>
      </div>
      <div className={`mt-3 font-mono text-6xl font-bold tabular-nums sm:text-7xl ${accent}`}>
        {loading ? "…" : value}
      </div>
    </div>
  );
}

function MiniTile({
  icon: Icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string | undefined;
  accent: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className={`h-4 w-4 ${accent}`} />
        <span className="text-xs font-medium tracking-wide">{label}</span>
      </div>
      <div className={`mt-1.5 font-mono text-3xl font-bold tabular-nums sm:text-4xl ${accent}`}>
        {loading ? "…" : (value ?? "—")}
      </div>
    </div>
  );
}

function WallCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </div>
  );
}

function DonutRow({ data }: { data: Slice[] }) {
  return (
    <div className="mt-2 flex items-center justify-center gap-6">
      {data.map((d) => (
        <div key={d.name} className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: d.color }} />
          <span className="text-sm text-slate-300">
            {d.name} <span className="font-semibold text-slate-100">{d.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
