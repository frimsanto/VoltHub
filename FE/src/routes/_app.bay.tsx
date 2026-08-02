import { createFileRoute } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { ListToolbar } from "@/components/v2/ListToolbar";
import { RowActions } from "@/components/v2/RowActions";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { RoleGate } from "@/components/v2/RoleGate";
import { ActiveBadge } from "@/components/v2/StatusBadge";
import { embeddedLocationLabel } from "@/features/v2/lookups";
import { useCan } from "@/lib/v2/rbac";
import { bays, type Bay, type BayFormValues } from "@/features/v2/bays/resource";
import { BayForm } from "@/features/v2/bays/BayForm";

export const Route = createFileRoute("/_app/bay")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: BayPage,
  head: () => ({ meta: [{ title: "Bay — VoltHub" }] }),
});

function BayPage() {
  const canWrite = useCan("bays.write");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Bay | null>(null);
  const [deleteRow, setDeleteRow] = useState<Bay | null>(null);

  const query = bays.useList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    search: search || undefined,
  });
  const createM = bays.useCreate();
  const updateM = bays.useUpdate();
  const removeM = bays.useRemove();

  const columns = useMemo<ColumnDef<Bay>[]>(
    () => [
      { header: "Kode", accessorKey: "code", cell: ({ row }) => <span className="font-medium">{row.original.code}</span> },
      { header: "Nama Bay", cell: ({ row }) => row.original.name },
      { header: "GI", cell: ({ row }) => embeddedLocationLabel(row.original.location) },
      { header: "Tegangan", cell: ({ row }) => row.original.voltageLevel ?? "—" },
      { header: "Status", cell: ({ row }) => <ActiveBadge active={row.original.isActive} /> },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => (
          <RowActions
            canWrite={canWrite}
            onEdit={() => setEditRow(row.original)}
            onDelete={() => setDeleteRow(row.original)}
          />
        ),
      },
    ],
    [canWrite],
  );

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  return (
    <div>
      <PageHeader
        title="Bay"
        description="Master data Bay GI (GI → Bay → Penyulang → Aset)."
        actions={
          <RoleGate capability="bays.write">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Tambah Bay
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
        toolbar={
          <ListToolbar
            searchPlaceholder="Cari kode / nama bay…"
            onSearch={(v) => {
              setSearch(v);
              resetPage();
            }}
          />
        }
      />

      <EntityFormModal open={createOpen} onOpenChange={setCreateOpen} title="Tambah Bay">
        <BayForm
          submitting={createM.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createM.mutate(values, { onSuccess: () => setCreateOpen(false) })}
        />
      </EntityFormModal>

      <EntityFormModal open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)} title="Edit Bay">
        {editRow && (
          <BayForm
            mode="edit"
            defaultValues={editRow as unknown as BayFormValues}
            submitting={updateM.isPending}
            onCancel={() => setEditRow(null)}
            onSubmit={(values) =>
              updateM.mutate(
                { id: editRow.id, body: { code: values.code, name: values.name, voltageLevel: values.voltageLevel, isActive: values.isActive } },
                { onSuccess: () => setEditRow(null) },
              )
            }
          />
        )}
      </EntityFormModal>

      <ConfirmDeleteDialog
        open={!!deleteRow}
        onOpenChange={(o) => !o && setDeleteRow(null)}
        title={`Hapus Bay ${deleteRow?.code ?? ""}?`}
        isPending={removeM.isPending}
        onConfirm={() => deleteRow && removeM.mutate(deleteRow.id, { onSuccess: () => setDeleteRow(null) })}
      />
    </div>
  );
}
