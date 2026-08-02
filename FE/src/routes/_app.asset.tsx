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
import { AssetStatusBadge } from "@/components/v2/StatusBadge";
import { RoleGate } from "@/components/v2/RoleGate";
import { useCan } from "@/lib/v2/rbac";
import { embeddedLocationLabel } from "@/features/v2/lookups";
import { ASSET_TYPES, ASSET_STATUSES, toOptions } from "@/lib/v2/enums";
import { assets, type AssetWithRelations } from "@/features/v2/assets/resource";
import { AssetForm } from "@/features/v2/assets/AssetForm";
import { AssetEditModal } from "@/features/v2/assets/AssetEditModal";

export const Route = createFileRoute("/_app/asset")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: AssetsPage,
  head: () => ({ meta: [{ title: "Assets — VoltHub" }] }),
});

function AssetsPage() {
  const navigate = useNavigate();
  const canWrite = useCan("assets.write");
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/asset/$id");

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [assetType, setAssetType] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();

  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteRow, setDeleteRow] = useState<AssetWithRelations | null>(null);

  const query = assets.useList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    assetType,
    status,
  });
  const createM = assets.useCreate();
  const removeM = assets.useRemove();

  const columns = useMemo<ColumnDef<AssetWithRelations>[]>(
    () => [
      {
        header: "Nama",
        accessorKey: "assetName",
        cell: ({ row }) => <span className="font-medium">{row.original.assetName}</span>,
      },
      { header: "Tipe", accessorKey: "assetType" },
      {
        header: "Gardu",
        accessorKey: "locationId",
        // Embedded relation (every row), not the 100-row option lookup.
        cell: ({ row }) => embeddedLocationLabel(row.original.location),
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => <AssetStatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => (
          <RowActions
            canWrite={canWrite}
            onView={() => navigate({ to: "/asset/$id", params: { id: row.original.id as string } })}
            onEdit={() => setEditId(row.original.id as string)}
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
        title="Assets"
        description="Master data aset telekomunikasi."
        actions={
          <RoleGate capability="assets.write">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Tambah Asset
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
        onRowClick={(row) => navigate({ to: "/asset/$id", params: { id: row.id as string } })}
        toolbar={
          <ListToolbar
            searchPlaceholder="Cari nama aset…"
            onSearch={(v) => {
              setSearch(v);
              resetPage();
            }}
            filters={
              <>
                <FilterSelect
                  value={assetType}
                  onChange={(v) => {
                    setAssetType(v);
                    resetPage();
                  }}
                  placeholder="Semua Tipe"
                  options={toOptions(ASSET_TYPES)}
                />
                <FilterSelect
                  value={status}
                  onChange={(v) => {
                    setStatus(v);
                    resetPage();
                  }}
                  placeholder="Semua Status"
                  options={toOptions(ASSET_STATUSES)}
                />
              </>
            }
          />
        }
      />

      {/* Create */}
      <EntityFormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Tambah Asset"
        className="sm:max-w-2xl"
      >
        <AssetForm
          submitting={createM.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createM.mutate(values, { onSuccess: () => setCreateOpen(false) })}
        />
      </EntityFormModal>

      {/* Edit (loads full detail) */}
      <AssetEditModal
        assetId={editId}
        open={!!editId}
        onOpenChange={(o) => !o && setEditId(null)}
      />

      {/* Delete */}
      <ConfirmDeleteDialog
        open={!!deleteRow}
        onOpenChange={(o) => !o && setDeleteRow(null)}
        title={`Hapus ${deleteRow?.assetName ?? "asset"}?`}
        isPending={removeM.isPending}
        onConfirm={() =>
          deleteRow &&
          removeM.mutate(deleteRow.id as string, { onSuccess: () => setDeleteRow(null) })
        }
      />
    </div>
  );
}
