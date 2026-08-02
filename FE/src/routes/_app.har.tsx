import { createFileRoute, useNavigate, Outlet, useMatches } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { ListToolbar, FilterSelect } from "@/components/v2/ListToolbar";
import { RowActions } from "@/components/v2/RowActions";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { RoleGate } from "@/components/v2/RoleGate";
import { HarTypeBadge, HarReportStatusBadge } from "@/components/v2/StatusBadge";
import { locationLabel as fmtLoc } from "@/lib/utils";
import { useLocationOptions } from "@/features/v2/lookups";
import {
  harNumber,
  harType,
  harReportStatus,
  harCreatedBy,
  HAR_TYPE_LABELS,
  HAR_REPORT_STATUS_LABELS,
  type HarType,
  type HarReportStatus,
} from "@/lib/v2/demo-adapter";
import { harReports, type HarReport } from "@/features/v2/har/resource";
import { HarReportForm } from "@/features/v2/har/HarReportForm";

export const Route = createFileRoute("/_app/har")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: HarPage,
  head: () => ({ meta: [{ title: "HAR — VoltHub" }] }),
});

const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : "—";

function HarPage() {
  const navigate = useNavigate();
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/har/$id");
  const { options: locationOptions } = useLocationOptions();
  const locationLabel = useMemo(
    () => new Map(locationOptions.map((o) => [o.value, o.label])),
    [locationOptions],
  );

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [locationId, setLocationId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);

  const query = harReports.useList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    locationId,
  });
  const createM = harReports.useCreate();

  const gardu = (r: HarReport) =>
    r.location
      ? fmtLoc(r.location.code, r.location.name)
      : (locationLabel.get(r.locationId ?? "") ?? "—");

  // Search + type/status are DEMO-derived → filter the current page client-side.
  const rows = useMemo(() => {
    const items = query.data?.items ?? [];
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (typeFilter && harType(r.id) !== typeFilter) return false;
      if (statusFilter && harReportStatus(r.id) !== statusFilter) return false;
      if (q) {
        const hay =
          `${harNumber(r.id, r.reportDate)} ${gardu(r)} ${harCreatedBy(r.id).name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, search, typeFilter, statusFilter, locationLabel]);

  const columns = useMemo<ColumnDef<HarReport>[]>(
    () => [
      {
        header: "Nomor HAR",
        id: "harNumber",
        cell: ({ row }) => (
          <span className="font-medium">{harNumber(row.original.id, row.original.reportDate)}</span>
        ),
      },
      { header: "Gardu", id: "gardu", cell: ({ row }) => gardu(row.original) },
      {
        header: "Tanggal",
        accessorKey: "reportDate",
        cell: ({ row }) => fmtDate(row.original.reportDate),
      },
      {
        header: "Jenis",
        id: "type",
        cell: ({ row }) => <HarTypeBadge type={harType(row.original.id)} />,
      },
      {
        header: "Status",
        id: "status",
        cell: ({ row }) => <HarReportStatusBadge status={harReportStatus(row.original.id)} />,
      },
      {
        header: "Dibuat Oleh",
        id: "createdBy",
        cell: ({ row }) => harCreatedBy(row.original.id).name,
      },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => (
          <RowActions onView={() => navigate({ to: "/har/$id", params: { id: row.original.id as string } })} />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, locationLabel],
  );

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  if (showingDetail) return <Outlet />;

  return (
    <div>
      <PageHeader
        title="HAR"
        description="Hasil Analisa & Rekomendasi pemeliharaan per gardu."
        actions={
          <RoleGate capability="har.create">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Buat HAR
            </Button>
          </RoleGate>
        }
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
        onRowClick={(row) => navigate({ to: "/har/$id", params: { id: row.id as string } })}
        toolbar={
          <ListToolbar
            searchPlaceholder="Cari nomor HAR / gardu / pembuat…"
            onSearch={(v) => {
              setSearch(v);
              resetPage();
            }}
            filters={
              <>
                <FilterSelect
                  value={typeFilter}
                  onChange={(v) => {
                    setTypeFilter(v);
                    resetPage();
                  }}
                  placeholder="Semua Jenis"
                  options={(Object.keys(HAR_TYPE_LABELS) as HarType[]).map((t) => ({
                    value: t,
                    label: HAR_TYPE_LABELS[t],
                  }))}
                />
                <FilterSelect
                  value={statusFilter}
                  onChange={(v) => {
                    setStatusFilter(v);
                    resetPage();
                  }}
                  placeholder="Semua Status"
                  options={(Object.keys(HAR_REPORT_STATUS_LABELS) as HarReportStatus[]).map(
                    (s) => ({
                      value: s,
                      label: HAR_REPORT_STATUS_LABELS[s],
                    }),
                  )}
                />
                <FilterSelect
                  value={locationId}
                  onChange={(v) => {
                    setLocationId(v);
                    resetPage();
                  }}
                  placeholder="Semua Gardu"
                  options={locationOptions}
                />
              </>
            }
          />
        }
      />

      <EntityFormModal open={createOpen} onOpenChange={setCreateOpen} title="Buat HAR">
        <HarReportForm
          submitting={createM.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) =>
            createM.mutate(values, {
              onSuccess: (created) => {
                setCreateOpen(false);
                navigate({ to: "/har/$id", params: { id: created.id as string } });
              },
            })
          }
        />
      </EntityFormModal>
    </div>
  );
}
