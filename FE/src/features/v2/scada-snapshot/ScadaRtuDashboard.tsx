// VoltHub — Dashboard Inscan/OOP dari snapshot RTU Siemens SP7.
//
// SUMBER ANGKA RC: scada_rtu_rows (snapshot SP7 terbaru yang diupload NOC) via
// GET /v1/scada/rtu — BUKAN registry scada_gardu. Hero band menampilkan IN-SCAN
// (UP) vs OOP (DOWN) vs Total, plus availability; di bawahnya donut komposisi
// dan tabel RTU dengan filter UP/DOWN/ALL + pencarian + pagination. Banner
// freshness memperingatkan bila data > 24 jam.
import { useState, type ReactNode } from "react";
import { RadioTower, Power, PowerOff, Search, Building2, Info } from "lucide-react";
import { SectionCard } from "@/features/v2/dashboard/widgets";
import { DonutChart, DonutLegend, type Slice } from "@/features/v2/dashboard/charts";
import { CHART_COLORS } from "@/lib/chart-config";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { useCountUp } from "@/lib/useCountUp";
import { useScadaLatest, useScadaRtuRows, type ScadaOperFilter } from "./api";
import {
  SnapshotBanner,
  SnapshotEmptyState,
  OperStateBadge,
  SnapshotPager,
} from "./snapshot-widgets";

const PAGE_SIZE = 50;

// Glosarium istilah RC — dirender sebagai pill bertooltip di header hero.
const GLOSSARY: { term: string; definition: string }[] = [
  {
    term: "Gardu RC",
    definition: "Gardu yang dilengkapi Remote Control (RTU SCADA).",
  },
  { term: "IN-SCAN", definition: "Komunikasi aktif — RTU terpantau master station." },
  { term: "OOP", definition: "Out of poll — telekontrol terputus." },
];

function GlossaryPills() {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-1.5">
        {GLOSSARY.map((g) => (
          <Tooltip key={g.term}>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-help items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Info className="size-3" /> {g.term}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-60">{g.definition}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

/** Satu sel hero band — angka besar count-up + label uppercase kecil. */
function HeroFigure({
  label,
  value,
  className,
  sub,
}: {
  label: string;
  value: number;
  className?: string;
  sub?: ReactNode;
}) {
  const animated = useCountUp(value);
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-[32px] font-bold leading-none tabular-nums ${className ?? ""}`}>
        {animated.toLocaleString("id-ID")}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function ScadaRtuDashboard({ initialFilter }: { initialFilter?: ScadaOperFilter }) {
  const latest = useScadaLatest("RTU");
  const [operState, setOperState] = useState<ScadaOperFilter>(initialFilter ?? "ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const rows = useScadaRtuRows(
    { operState, search: search || undefined, page, limit: PAGE_SIZE },
    // Never fire against an empty DB (the list endpoint 404s without a snapshot).
    latest.data != null,
  );

  if (latest.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="shimmer h-10 w-full" />
        <Skeleton className="shimmer h-28 w-full" />
        <Skeleton className="shimmer h-64 w-full" />
      </div>
    );
  }

  const s = latest.data;
  if (!s) return <SnapshotEmptyState label="RTU" />;

  const availability = s.totalRows > 0 ? (s.totalUp / s.totalRows) * 100 : null;
  const donut: Slice[] = [
    { name: "UP (Inscan)", value: s.totalUp, color: CHART_COLORS.success },
    { name: "DOWN (OOP)", value: s.totalDown, color: CHART_COLORS.danger },
  ];

  return (
    <div className="space-y-6">
      <SnapshotBanner snapshot={s} />

      {/* Hero band: IN-SCAN vs OOP vs Total + availability, glossary di kanan. */}
      <div className="rounded-[10px] border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <RadioTower className="size-3.5" /> Status Gardu RC — snapshot SP7
          </div>
          <GlossaryPills />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <HeroFigure
            label="IN-SCAN"
            value={s.totalUp}
            className="text-green-600 dark:text-green-400"
            sub={
              <span className="inline-flex items-center gap-1">
                <Power className="size-3" /> komunikasi aktif
              </span>
            }
          />
          <HeroFigure
            label="OOP"
            value={s.totalDown}
            className="text-red-600 dark:text-red-400"
            sub={
              <span className="inline-flex items-center gap-1">
                <PowerOff className="size-3" /> telekontrol terputus
              </span>
            }
          />
          <HeroFigure label="Total RTU" value={s.totalRows} />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Availability
            </p>
            <p className="mt-1 text-[32px] font-bold leading-none tabular-nums text-amber-600 dark:text-amber-400">
              {availability != null ? `${availability.toFixed(2)}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">UP / total RTU snapshot</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Komposisi Status" icon={RadioTower}>
          <DonutChart data={donut} />
          <DonutLegend data={donut} />
        </SectionCard>

        <SectionCard
          title="Daftar RTU"
          icon={Building2}
          className="lg:col-span-2"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Tabs
                value={operState}
                onValueChange={(v) => {
                  setOperState(v as ScadaOperFilter);
                  setPage(1);
                }}
              >
                <TabsList>
                  <TabsTrigger value="ALL">Semua</TabsTrigger>
                  <TabsTrigger value="UP">UP</TabsTrigger>
                  <TabsTrigger value="DOWN">DOWN</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative w-48">
                <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Cari RTU…"
                  className="pl-8"
                />
              </div>
            </div>
          }
        >
          {rows.isLoading ? (
            <Skeleton className="shimmer h-64 w-full" />
          ) : (
            <>
              <div className="max-h-130 overflow-auto" data-lenis-prevent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>RTU</TableHead>
                      <TableHead>Keterangan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Server</TableHead>
                      <TableHead>Protocol</TableHead>
                      <TableHead>Gardu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rows.data?.items ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.rtuName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.rtuText && r.rtuText !== r.rtuName ? r.rtuText : "—"}
                        </TableCell>
                        <TableCell>
                          <OperStateBadge state={r.operState} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.server ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.protocol ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.location ? `${r.location.code}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(rows.data?.items.length ?? 0) === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Tidak ada RTU yang cocok dengan filter.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <SnapshotPager
                meta={rows.data?.meta}
                page={page}
                onPageChange={setPage}
                shown={rows.data?.items.length ?? 0}
              />
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
