// VoltHub — Dashboard SCADA Lines (channel/koneksi IFS) dari snapshot SP7.
//
// Membaca GET /v1/scada/lines: status channel per IFS server (gbr11ifs,
// gbr12ifs, dst). Stat UP vs DOWN per server + tabel channel yang digroup per
// server untuk readability. Catatan data: hanya channel yang membawa Oper
// State di export SP7 yang masuk snapshot (slot UNASG kosong dilewati).
import { Fragment, useState } from "react";
import { CircleDashed, Network, Power, PowerOff, Search, Server } from "lucide-react";
import { StatCard, SectionCard } from "@/features/v2/dashboard/widgets";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { useScadaLatest, useScadaLineRows, type ScadaOperFilter } from "./api";
import {
  SnapshotBanner,
  SnapshotEmptyState,
  OperStateBadge,
  SnapshotPager,
} from "./snapshot-widgets";

const PAGE_SIZE = 50;
const ALL_SERVERS = "__ALL__";

export function ScadaLinesDashboard() {
  const latest = useScadaLatest("LINES");
  const [operState, setOperState] = useState<ScadaOperFilter>("ALL");
  const [ifsServer, setIfsServer] = useState<string>(ALL_SERVERS);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const rows = useScadaLineRows(
    {
      operState,
      ifsServer: ifsServer !== ALL_SERVERS ? ifsServer : undefined,
      search: search || undefined,
      page,
      limit: PAGE_SIZE,
    },
    latest.data != null,
  );

  if (latest.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const s = latest.data;
  if (!s) return <SnapshotEmptyState label="Lines" />;

  const servers = s.servers ?? [];
  const items = rows.data?.items ?? [];
  // Slot channel UNASG tanpa Oper State — tetap diingest agar file terbaca utuh.
  const noState = s.totalRows - s.totalUp - s.totalDown;

  return (
    <div className="space-y-6">
      <SnapshotBanner snapshot={s} />

      {/* Headline: total channel + UP/DOWN split (sisanya slot tanpa status). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Network}
          label="Total Channel"
          value={s.totalRows}
          tone="text-blue-600 dark:text-blue-400 bg-blue-500/10"
        />
        <StatCard
          icon={Power}
          label="UP (Inscan)"
          value={s.totalUp}
          tone="text-green-600 dark:text-green-400 bg-green-500/10"
        />
        <StatCard
          icon={PowerOff}
          label="DOWN (OOP)"
          value={s.totalDown}
          tone="text-red-600 dark:text-red-400 bg-red-500/10"
        />
        <StatCard
          icon={CircleDashed}
          label="Tanpa Status (UNASG)"
          value={noState}
          tone="text-slate-500 dark:text-slate-400 bg-slate-500/10"
        />
      </div>

      {/* Per-server breakdown. */}
      <SectionCard title="Status per IFS Server" icon={Server}>
        <div className="overflow-x-auto" data-lenis-prevent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IFS Server</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">UP</TableHead>
                <TableHead className="text-right">DOWN</TableHead>
                <TableHead className="text-right">Tanpa Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((sv) => (
                <TableRow key={sv.ifsServer ?? "-"}>
                  <TableCell className="font-medium">{sv.ifsServer ?? "(tanpa server)"}</TableCell>
                  <TableCell className="text-right tabular-nums">{sv.total}</TableCell>
                  <TableCell className="text-right tabular-nums text-green-600 dark:text-green-400">
                    {sv.up}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                    {sv.down}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {sv.none}
                  </TableCell>
                </TableRow>
              ))}
              {servers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Belum ada data server.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* Channel list, grouped by server. */}
      <SectionCard
        title="Daftar Channel"
        icon={Network}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={ifsServer}
              onValueChange={(v) => {
                setIfsServer(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Semua server" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SERVERS}>Semua server</SelectItem>
                {servers
                  .filter((sv) => sv.ifsServer)
                  .map((sv) => (
                    <SelectItem key={sv.ifsServer!} value={sv.ifsServer!}>
                      {sv.ifsServer}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
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
                <TabsTrigger value="NONE">Tanpa Status</TabsTrigger>
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
                placeholder="Cari channel / IP…"
                className="pl-8"
              />
            </div>
          </div>
        }
      >
        {rows.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <div className="max-h-130 overflow-auto" data-lenis-prevent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Asgd</TableHead>
                    <TableHead>Data Xfr</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Port</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r, i) => {
                    // Rows arrive ordered by (ifsServer, channelId) — inject a
                    // group header whenever the server changes for readability.
                    const prev = items[i - 1];
                    const newGroup = !prev || prev.ifsServer !== r.ifsServer;
                    return (
                      <Fragment key={r.id}>
                        {newGroup && (
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableCell
                              colSpan={7}
                              className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              <Server className="mr-1.5 inline size-3.5" />
                              {r.ifsServer ?? "(tanpa server)"}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow>
                          <TableCell className="font-medium">
                            {r.channelName ?? `Chan ${r.channelId ?? "—"}`}
                            {r.channelText && r.channelText !== r.channelName && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {r.channelText}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <OperStateBadge state={r.operState} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {r.assigned ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {r.dataXfr ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {r.deviceType ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{r.ipAddr ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{r.port ?? "—"}</TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Tidak ada channel yang cocok dengan filter.
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
              shown={items.length}
            />
          </>
        )}
      </SectionCard>
    </div>
  );
}
