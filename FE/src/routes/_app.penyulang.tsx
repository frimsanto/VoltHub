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
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { RoleGate } from "@/components/v2/RoleGate";
import { useCan } from "@/lib/v2/rbac";
import { useLocationOptions, embeddedLocationLabel } from "@/features/v2/lookups";
import {
  feeders,
  type FeederFormValues,
  type FeederWithLocation,
} from "@/features/v2/feeders/resource";
import { FeederForm } from "@/features/v2/feeders/FeederForm";

export const Route = createFileRoute("/_app/penyulang")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: FeedersPage,
  head: () => ({ meta: [{ title: "Penyulang — VoltHub" }] }),
});

function FeedersPage() {
  const navigate = useNavigate();
  const canWrite = useCan("feeders.write");
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/penyulang/$id");
  const { options: locationOptions } = useLocationOptions("GI");

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState<string | undefined>();

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<FeederWithLocation | null>(null);
  const [deleteRow, setDeleteRow] = useState<FeederWithLocation | null>(null);

  const query = feeders.useList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    locationId,
  });
  const createM = feeders.useCreate();
  const updateM = feeders.useUpdate();
  const removeM = feeders.useRemove();

  const columns = useMemo<ColumnDef<FeederWithLocation>[]>(
    () => [
      {
        header: "Nama",
        accessorKey: "feederName",
        cell: ({ row }) => <span className="font-medium">{row.original.feederName}</span>,
      },
      {
        header: "Gardu Induk",
        accessorKey: "locationId",
        // Read the embedded relation (present on every row) — not the 100-row
        // option lookup, which leaves the Gardu name blank across 14k+ gardu.
        cell: ({ row }) => embeddedLocationLabel(row.original.location),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => (
          <RowActions
            canWrite={canWrite}
            onView={() =>
              navigate({ to: "/penyulang/$id", params: { id: row.original.id as string } })
            }
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
        title="Penyulang"
        description="Master data penyulang / feeder."
        actions={
          <RoleGate capability="feeders.write">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Tambah Penyulang
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
        onRowClick={(row) => navigate({ to: "/penyulang/$id", params: { id: row.id as string } })}
        toolbar={
          <ListToolbar
            searchPlaceholder="Cari nama penyulang…"
            onSearch={(v) => {
              setSearch(v);
              resetPage();
            }}
            filters={
              <FilterSelect
                value={locationId}
                onChange={(v) => {
                  setLocationId(v);
                  resetPage();
                }}
                placeholder="Semua Gardu Induk"
                options={locationOptions}
              />
            }
          />
        }
      />

      <EntityFormModal open={createOpen} onOpenChange={setCreateOpen} title="Tambah Penyulang">
        <FeederForm
          submitting={createM.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createM.mutate(values, { onSuccess: () => setCreateOpen(false) })}
        />
      </EntityFormModal>

      <EntityFormModal
        open={!!editRow}
        onOpenChange={(o) => !o && setEditRow(null)}
        title="Ubah Penyulang"
      >
        {editRow && (
          <FeederForm
            defaultValues={editRow as FeederFormValues}
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

      <ConfirmDeleteDialog
        open={!!deleteRow}
        onOpenChange={(o) => !o && setDeleteRow(null)}
        title={`Hapus ${deleteRow?.feederName ?? "feeder"}?`}
        isPending={removeM.isPending}
        onConfirm={() =>
          deleteRow &&
          removeM.mutate(deleteRow.id as string, { onSuccess: () => setDeleteRow(null) })
        }
      />
    </div>
  );
}
