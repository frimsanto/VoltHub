import { createFileRoute, useNavigate, Outlet, useMatches } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { createInspectionOrQueue } from "@/lib/offline/sync";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { ListToolbar, DateRangeFilter } from "@/components/v2/ListToolbar";
import { RowActions } from "@/components/v2/RowActions";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { RoleGate } from "@/components/v2/RoleGate";
import { locationLabel as fmtLoc } from "@/lib/utils";
import { useLocationOptions } from "@/features/v2/lookups";
import { inspections, type Inspection } from "@/features/v2/inspections/resource";
import { InspectionForm } from "@/features/v2/inspections/InspectionForm";

export const Route = createFileRoute("/_app/inspection")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: InspectionsPage,
  head: () => ({ meta: [{ title: "Inspeksi — VoltHub" }] }),
});

const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : "—";

function InspectionsPage() {
  const navigate = useNavigate();
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/inspection/$id");
  const { options: locationOptions } = useLocationOptions();
  const locationLabel = useMemo(
    () => new Map(locationOptions.map((o) => [o.value, o.label])),
    [locationOptions],
  );

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const query = inspections.useList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    dateFrom,
    dateTo,
  });

  const columns = useMemo<ColumnDef<Inspection>[]>(
    () => [
      {
        header: "Tanggal",
        accessorKey: "inspectionDate",
        cell: ({ row }) => (
          <span className="font-medium">{fmtDate(row.original.inspectionDate)}</span>
        ),
      },
      {
        header: "Lokasi",
        accessorKey: "locationId",
        cell: ({ row }) =>
          row.original.location
            ? fmtLoc(row.original.location.code, row.original.location.name)
            : (locationLabel.get(row.original.locationId ?? "") ?? "—"),
      },
      {
        header: "Inspector",
        accessorKey: "inspector",
        cell: ({ row }) => row.original.inspector?.name ?? "—",
      },
      {
        header: "Temuan",
        accessorKey: "_count",
        cell: ({ row }) => row.original._count?.findings ?? 0,
      },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => (
          <RowActions onView={() => navigate({ to: "/inspection/$id", params: { id: row.original.id as string } })} />
        ),
      },
    ],
    [navigate, locationLabel],
  );

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  if (showingDetail) return <Outlet />;

  return (
    <div>
      <PageHeader
        title="Inspeksi"
        description="Catatan inspeksi aset per lokasi."
        actions={
          <RoleGate capability="inspections.create">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Buat Inspeksi
            </Button>
          </RoleGate>
        }
      />

      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        pageCount={query.data?.meta.totalPages ?? 0}
        total={query.data?.meta.total}
        pagination={pagination}
        onPaginationChange={setPagination}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        onRowClick={(row) => navigate({ to: "/inspection/$id", params: { id: row.id as string } })}
        toolbar={
          <ListToolbar
            searchPlaceholder="Cari lokasi…"
            onSearch={(v) => {
              setSearch(v);
              resetPage();
            }}
            filters={
              <DateRangeFilter
                from={dateFrom}
                to={dateTo}
                onChange={({ from, to }) => {
                  setDateFrom(from);
                  setDateTo(to);
                  resetPage();
                }}
              />
            }
          />
        }
      />

      <EntityFormModal open={createOpen} onOpenChange={setCreateOpen} title="Buat Inspeksi">
        <InspectionForm
          submitting={submitting}
          onCancel={() => setCreateOpen(false)}
          onSubmit={async (values) => {
            setSubmitting(true);
            // Offline-capable create: submits now if online, otherwise queues the
            // inspection (and replays it automatically when connectivity returns).
            const label = `${locationLabel.get(values.locationId) ?? "Inspeksi"} · ${fmtDate(values.inspectionDate)}`;
            try {
              const res = await createInspectionOrQueue(
                {
                  locationId: values.locationId,
                  inspectionDate: values.inspectionDate,
                  notes: values.notes ?? null,
                },
                [],
                label,
              );
              setCreateOpen(false);
              if (res.queued) {
                toast.success("Inspeksi disimpan offline", {
                  description: "Akan dikirim otomatis saat perangkat kembali online.",
                });
              } else if (res.result) {
                qc.invalidateQueries({ queryKey: inspections.keys.lists() });
                navigate({ to: "/inspection/$id", params: { id: res.result.id as string } });
              }
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal menyimpan inspeksi");
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </EntityFormModal>
    </div>
  );
}
