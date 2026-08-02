import { createFileRoute, useNavigate, Outlet, useMatches } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { PaginationState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { ListToolbar, FilterSelect } from "@/components/v2/ListToolbar";
import { RowActions } from "@/components/v2/RowActions";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { ActiveBadge, RcOperStateBadge, VipBadge } from "@/components/v2/StatusBadge";
import { RoleGate } from "@/components/v2/RoleGate";
import { useCan } from "@/lib/v2/rbac";
import { LOCATION_TYPES, toOptions } from "@/lib/v2/enums";
import { garduIsVip } from "@/lib/v2/demo-adapter";
import type { Location } from "@/lib/api/v2";
import { locations, type LocationFormValues } from "@/features/v2/locations/resource";
import { LocationForm } from "@/features/v2/locations/LocationForm";

export const Route = createFileRoute("/_app/gardu")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: LocationsPage,
  head: () => ({ meta: [{ title: "Gardu — VoltHub" }] }),
});

function LocationsPage() {
  const navigate = useNavigate();
  const canWrite = useCan("locations.write");

  // The detail route (/gardu/$id) is nested under this list route. When it's
  // active, render only its content via <Outlet/> instead of the list.
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/gardu/$id");

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string | undefined>();

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Location | null>(null);
  const [deleteRow, setDeleteRow] = useState<Location | null>(null);

  const query = locations.useList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    type,
  });

  const createM = locations.useCreate();
  const updateM = locations.useUpdate();
  const removeM = locations.useRemove();

  const columns = useMemo<ColumnDef<Location>[]>(
    () => [
      {
        header: "Nama Gardu",
        accessorKey: "name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      { header: "UP3", accessorKey: "up3", cell: ({ row }) => row.original.up3 ?? "—" },
      {
        id: "rcStatus",
        header: "Status RC",
        cell: ({ row }) => <RcOperStateBadge operState={row.original.scadaOperState} />,
      },
      {
        id: "vip",
        header: "VIP",
        cell: ({ row }) => <VipBadge vip={garduIsVip(row.original.id ?? "")} />,
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => <ActiveBadge active={row.original.status} />,
      },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => (
          <RowActions
            canWrite={canWrite}
            onView={() => navigate({ to: "/gardu/$id", params: { id: row.original.id as string } })}
            onEdit={() => setEditRow(row.original)}
            onDelete={() => setDeleteRow(row.original)}
          />
        ),
      },
    ],
    [canWrite, navigate],
  );

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  if (showingDetail) return <Outlet />;

  return (
    <div>
      <PageHeader
        title="Gardu"
        description="Data gardu & lokasi jaringan (GI / GH / Gardu Distribusi)."
        actions={
          <RoleGate capability="locations.write">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Tambah Gardu
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
        onRowClick={(row) => navigate({ to: "/gardu/$id", params: { id: row.id as string } })}
        toolbar={
          <ListToolbar
            searchPlaceholder="Cari nama gardu…"
            onSearch={(v) => {
              setSearch(v);
              resetPage();
            }}
            filters={
              <FilterSelect
                value={type}
                onChange={(v) => {
                  setType(v);
                  resetPage();
                }}
                placeholder="Semua Tipe"
                options={toOptions(LOCATION_TYPES)}
              />
            }
          />
        }
      />

      {/* Create */}
      <EntityFormModal open={createOpen} onOpenChange={setCreateOpen} title="Tambah Gardu">
        <LocationForm
          submitting={createM.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createM.mutate(values, { onSuccess: () => setCreateOpen(false) })}
        />
      </EntityFormModal>

      {/* Edit */}
      <EntityFormModal
        open={!!editRow}
        onOpenChange={(o) => !o && setEditRow(null)}
        title="Ubah Gardu"
      >
        {editRow && (
          <LocationForm
            defaultValues={editRow as LocationFormValues}
            submitting={updateM.isPending}
            onCancel={() => setEditRow(null)}
            onSubmit={(values) =>
              updateM.mutate(
                { id: editRow.id as string, body: values },
                { onSuccess: () => setEditRow(null) },
              )
            }
          />
        )}
      </EntityFormModal>

      {/* Delete */}
      <ConfirmDeleteDialog
        open={!!deleteRow}
        onOpenChange={(o) => !o && setDeleteRow(null)}
        title={`Hapus ${deleteRow?.name ?? "location"}?`}
        isPending={removeM.isPending}
        onConfirm={() =>
          deleteRow &&
          removeM.mutate(deleteRow.id as string, { onSuccess: () => setDeleteRow(null) })
        }
      />
    </div>
  );
}
