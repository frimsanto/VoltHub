import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { ListToolbar } from "@/components/v2/ListToolbar";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { ActiveBadge } from "@/components/v2/StatusBadge";
import { requireV2Role, MASTER_ONLY_ROLES } from "@/lib/v2/route-guards";
import type { Rtupp } from "@/lib/api/rtupp";
import { useRtupps, useCreateRtupp, useUpdateRtupp, useDeleteRtupp } from "@/features/v2/admin/hooks";
import { RtuppForm } from "@/features/v2/admin/forms";

export const Route = createFileRoute("/_app/rtupp")({
  beforeLoad: () => requireV2Role(MASTER_ONLY_ROLES),
  component: RtuppPage,
  head: () => ({ meta: [{ title: "RTUPP — VoltHub" }] }),
});

function RtuppPage() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 100 });
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Rtupp | null>(null);
  const [deleteRow, setDeleteRow] = useState<Rtupp | null>(null);

  const query = useRtupps({ search: search || undefined });
  const createM = useCreateRtupp();
  const updateM = useUpdateRtupp();
  const deleteM = useDeleteRtupp();

  const columns = useMemo<ColumnDef<Rtupp>[]>(
    () => [
      { header: "Kode", accessorKey: "code", cell: ({ row }) => <span className="font-medium">{row.original.code}</span> },
      { header: "Nama", accessorKey: "name" },
      { header: "Region", accessorKey: "region", cell: ({ row }) => row.original.region ?? "—" },
      { header: "Teams", id: "teams", cell: ({ row }) => row.original._count?.teams ?? 0 },
      { header: "Users", id: "users", cell: ({ row }) => row.original._count?.users ?? 0 },
      { header: "Status", accessorKey: "isActive", cell: ({ row }) => <ActiveBadge active={row.original.isActive} /> },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditRow(row.original)} aria-label="Ubah">
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => setDeleteRow(row.original)} aria-label="Hapus">
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  return (
    <div>
      <PageHeader
        title="RTUPP"
        description="Wilayah operasional (RTUPP) — induk dari Teams & Users."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Tambah RTUPP
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={query.data ?? []}
        pageCount={1}
        total={query.data?.length}
        pagination={pagination}
        onPaginationChange={setPagination}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        toolbar={
          <ListToolbar searchPlaceholder="Cari kode / nama…" onSearch={(v) => { setSearch(v); resetPage(); }} />
        }
      />

      <EntityFormModal open={createOpen} onOpenChange={setCreateOpen} title="Tambah RTUPP">
        <RtuppForm
          submitting={createM.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createM.mutate(values, { onSuccess: () => setCreateOpen(false) })}
        />
      </EntityFormModal>

      <EntityFormModal open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)} title="Ubah RTUPP">
        {editRow && (
          <RtuppForm
            defaultValues={{
              code: editRow.code,
              name: editRow.name,
              region: editRow.region ?? undefined,
              address: editRow.address ?? undefined,
              phone: editRow.phone ?? undefined,
              isActive: editRow.isActive,
            }}
            submitting={updateM.isPending}
            onCancel={() => setEditRow(null)}
            onSubmit={(values) => updateM.mutate({ id: editRow.id, body: values }, { onSuccess: () => setEditRow(null) })}
          />
        )}
      </EntityFormModal>

      <ConfirmDeleteDialog
        open={!!deleteRow}
        onOpenChange={(o) => !o && setDeleteRow(null)}
        title={`Hapus RTUPP ${deleteRow?.name ?? ""}?`}
        isPending={deleteM.isPending}
        onConfirm={() => deleteRow && deleteM.mutate(deleteRow.id, { onSuccess: () => setDeleteRow(null) })}
      />
    </div>
  );
}
