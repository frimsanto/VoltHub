import { createFileRoute, useNavigate, Outlet, useMatches } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Activity } from "lucide-react";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { ListToolbar, FilterSelect } from "@/components/v2/ListToolbar";
import { RcStatusBadge } from "@/components/v2/StatusBadge";
import { locationLabel } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { locations } from "@/features/v2/locations/resource";
import {
  performance,
  availabilityPct,
  rcStatusForDate,
  type PerformanceRecord,
} from "@/features/v2/performance/resource";

export const Route = createFileRoute("/_app/performance")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: PerformancePage,
  head: () => ({ meta: [{ title: "Performance — VoltHub" }] }),
});

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : "—";

function AvailabilityBadge({ pct }: { pct: number }) {
  const up = pct >= 100;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
        up
          ? "bg-green-500/15 text-green-700 dark:text-green-400"
          : "bg-red-500/15 text-red-700 dark:text-red-400"
      }`}
    >
      {pct}%
    </span>
  );
}

function PerformancePage() {
  const navigate = useNavigate();
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/performance/$id");

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState<string | undefined>();
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Gardu filter options (the list API caps `limit` at 100; request the max).
  const garduQ = locations.useList({ page: 1, limit: 100 });
  const garduOptions = useMemo(
    () =>
      (garduQ.data?.items ?? []).map((g) => ({
        value: g.id ?? "",
        label: locationLabel(g.code, g.name),
      })),
    [garduQ.data],
  );

  const query = performance.useList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    locationId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  // Search is client-side over the loaded page (backend list has no text search).
  const rows = useMemo(() => {
    const items = query.data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => {
      const code = r.location?.code?.toLowerCase() ?? "";
      const name = r.location?.name?.toLowerCase() ?? "";
      return code.includes(q) || name.includes(q);
    });
  }, [query.data, search]);

  const columns = useMemo<ColumnDef<PerformanceRecord>[]>(
    () => [
      {
        header: "Gardu",
        cell: ({ row }) =>
          row.original.location
            ? locationLabel(row.original.location.code, row.original.location.name)
            : row.original.locationId,
      },
      { header: "Tanggal", cell: ({ row }) => fmtDate(row.original.performanceDate) },
      {
        header: "Availability",
        cell: ({ row }) => <AvailabilityBadge pct={availabilityPct(row.original)} />,
      },
      {
        header: "RC Status",
        cell: ({ row }) => (
          <RcStatusBadge
            status={rcStatusForDate(row.original.locationId, row.original.performanceDate)}
          />
        ),
      },
      {
        header: "Performance Score",
        cell: ({ row }) =>
          row.original.score != null ? (
            <span className="font-semibold tabular-nums">{row.original.score}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      { header: "Dibuat", cell: ({ row }) => fmtDate(row.original.createdAt) },
    ],
    [],
  );

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  if (showingDetail) return <Outlet />;

  return (
    <div>
      <PageHeader
        title="Performance"
        description="Kinerja & availability harian gardu (RC / SCADA)."
      />

      <DataTable
        columns={columns}
        data={rows}
        pageCount={query.data?.meta.totalPages ?? 0}
        total={query.data?.meta.total}
        pagination={pagination}
        onPaginationChange={setPagination}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        onRowClick={(row) => navigate({ to: "/performance/$id", params: { id: row.id as string } })}
        toolbar={
          <ListToolbar
            searchPlaceholder="Cari gardu…"
            onSearch={(v) => {
              setSearch(v);
              resetPage();
            }}
            filters={
              <>
                <FilterSelect
                  value={locationId}
                  onChange={(v) => {
                    setLocationId(v);
                    resetPage();
                  }}
                  placeholder="Semua Gardu"
                  options={garduOptions}
                />
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    resetPage();
                  }}
                  className="h-9 w-auto"
                  aria-label="Dari tanggal"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    resetPage();
                  }}
                  className="h-9 w-auto"
                  aria-label="Sampai tanggal"
                />
              </>
            }
          />
        }
      />
    </div>
  );
}
