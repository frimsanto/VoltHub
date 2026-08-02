// VoltHub — Breakdown GH/GI dari registry SCADA (workbook availability).
//
// PENTING: angka Gardu RC (IN-SCAN/OOP) TIDAK berasal dari sini — sumbernya
// snapshot SP7 (scada_rtu_rows) yang dirender ScadaRtuDashboard. Komponen ini
// tinggal melayani breakdown sekunder GH/GI/GFD per RTUPP/Wilayah dari registry
// scada_gardu (data workbook), sehingga opsi "Gardu RC" dicabut dari toggle.
import { useState } from "react";
import { RadioTower, Power, PowerOff, Gauge, Search } from "lucide-react";
import { StatCard, SectionCard } from "@/features/v2/dashboard/widgets";
import { DonutChart, DonutLegend, type Slice } from "@/features/v2/dashboard/charts";
import { CHART_COLORS } from "@/lib/chart-config";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  useScadaSummary,
  useScadaGardu,
  type ScadaType,
} from "./api";

const TYPE_LABEL: Record<ScadaType, string> = {
  RC: "Gardu RC",
  GH: "Gardu Hubung",
  GI: "Gardu Induk",
  GFD: "GFD",
};

const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toFixed(2)}%`;

export function ScadaRealtimeDashboard() {
  // Default GH — angka RC datang dari snapshot SP7 (ScadaRtuDashboard), bukan
  // registry ini; menampilkan "RC" di sini hanya membingungkan (sering kosong).
  const [type, setType] = useState<ScadaType>("GH");
  const summary = useScadaSummary(type);
  const s = summary.data;

  const donut: Slice[] = [
    { name: "IN-SCAN", value: s?.inScan ?? 0, color: CHART_COLORS.success },
    { name: "OOP", value: s?.oop ?? 0, color: CHART_COLORS.danger },
    ...(s?.unknown
      ? [{ name: "Belum ada data", value: s.unknown, color: CHART_COLORS.gray }]
      : []),
  ];

  const dimLabel = s?.dimension === "wilayah" ? "Wilayah" : "RTUPP";

  return (
    <div className="space-y-6">
      {/* Type toggle + as-of indicator. Tanpa "Gardu RC": angka RC bersumber
          dari snapshot SP7 di bagian utama tab Inscan/OOP. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={type} onValueChange={(v) => setType(v as ScadaType)}>
          <TabsList>
            <TabsTrigger value="GH">GH</TabsTrigger>
            <TabsTrigger value="GI">GI</TabsTrigger>
            <TabsTrigger value="GFD">GFD</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="text-xs text-muted-foreground">
          Registry workbook · data per {s?.asOfDate ?? "—"}
        </div>
      </div>

      {/* Headline INS / OOP figures */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={RadioTower}
          label={`Total ${TYPE_LABEL[type]}`}
          value={s?.total}
          loading={summary.isLoading}
          tone="text-blue-600 dark:text-blue-400 bg-blue-500/10"
        />
        <StatCard
          icon={Power}
          label="IN-SCAN (terpantau)"
          value={s?.inScan}
          loading={summary.isLoading}
          tone="text-green-600 dark:text-green-400 bg-green-500/10"
        />
        <StatCard
          icon={PowerOff}
          label="OOP (out of poll)"
          value={s?.oop}
          loading={summary.isLoading}
          tone="text-red-600 dark:text-red-400 bg-red-500/10"
        />
        <StatCard
          icon={Gauge}
          label="%AVA YTD (rata-rata)"
          value={pct(s?.avaAvg)}
          loading={summary.isLoading}
          tone="text-amber-600 dark:text-amber-400 bg-amber-500/10"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Donut */}
        <SectionCard title="Komposisi Status" icon={RadioTower}>
          {summary.isLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <>
              <DonutChart data={donut} />
              <DonutLegend data={donut} />
            </>
          )}
        </SectionCard>

        {/* Breakdown per RTUPP/Wilayah */}
        <SectionCard title={`Status per ${dimLabel}`} icon={RadioTower} className="lg:col-span-2">
          {summary.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="max-h-72 overflow-auto" data-lenis-prevent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{dimLabel}</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">IN-SCAN</TableHead>
                    <TableHead className="text-right">OOP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(s?.breakdown ?? []).map((b) => (
                    <TableRow key={b.name}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.total}</TableCell>
                      <TableCell className="text-right tabular-nums text-green-600 dark:text-green-400">
                        {b.inScan}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {b.oop > 0 ? (
                          <Badge variant="destructive">{b.oop}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(s?.breakdown?.length ?? 0) === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Belum ada data.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      </div>

      {/* OOP drill-down */}
      <OopList type={type} />
    </div>
  );
}

/** Drill-down list of gardu currently OOP, with a code search. */
function OopList({ type }: { type: ScadaType }) {
  const [search, setSearch] = useState("");
  const q = useScadaGardu({ type, status: "OOP", search: search || undefined, limit: 100 });

  return (
    <SectionCard
      title="Daftar Gardu OOP"
      icon={PowerOff}
      action={
        <div className="relative w-56">
          <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode gardu…"
            className="pl-8"
          />
        </div>
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="max-h-96 overflow-auto" data-lenis-prevent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gardu</TableHead>
                <TableHead>UP3 / Wilayah</TableHead>
                <TableHead>RTUPP</TableHead>
                <TableHead className="text-right">%AVA YTD</TableHead>
                <TableHead>Sejak</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data?.items.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.code}</TableCell>
                  <TableCell className="text-muted-foreground">{g.up3 ?? g.wilayah ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{g.rtupp ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(g.avaYtd)}</TableCell>
                  <TableCell className="text-muted-foreground">{g.asOfDate ?? "—"}</TableCell>
                </TableRow>
              ))}
              {(q.data?.items.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Tidak ada gardu OOP. 🎉
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {(q.data?.meta.total ?? 0) > (q.data?.items.length ?? 0) && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Menampilkan {q.data?.items.length} dari {q.data?.meta.total} gardu OOP.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}
