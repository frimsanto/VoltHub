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
import { requireV2Role, ADMIN_TIER_ROLES } from "@/lib/v2/route-guards";
import type { Personil } from "@/lib/api/personil";
import {
  usePersonil,
  useCreatePersonil,
  useUpdatePersonil,
  useDeletePersonil,
} from "@/features/v2/admin/hooks";
import { PersonilForm } from "@/features/v2/admin/forms";

export const Route = createFileRoute("/_app/personil")({
  beforeLoad: () => requireV2Role(ADMIN_TIER_ROLES),
  component: PersonilPage,
  head: () => ({ meta: [{ title: "Personil — VoltHub" }] }),
});

function PersonilPage() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 100 });
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Personil | null>(null);
  const [deleteRow, setDeleteRow] = useState<Personil | null>(null);

  // ADMIN is scoped to its own RTUPP server-side; MASTER sees all.
  const query = usePersonil({ search: search || undefined });
  const createM = useCreatePersonil();
  const updateM = useUpdatePersonil();
  const deleteM = useDeletePersonil();

  const columns = useMemo<ColumnDef<Personil>[]>(
    () => [
      { header: "NIP", accessorKey: "nip", cell: ({ row }) => <span className="font-medium">{row.original.nip}</span> },
      { header: "Nama", accessorKey: "nama" },
      { header: "Jabatan", accessorKey: "jabatan" },
      { header: "RTUPP", id: "rtupp", cell: ({ row }) => row.original.rtupp?.code ?? "—" },
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
        title="Personil"
        description="Master pelaksana lapangan per RTUPP — dipakai di pemilihan personil Laporan Awal."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Tambah Personil
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
          <ListToolbar searchPlaceholder="Cari NIP / nama / jabatan…" onSearch={(v) => { setSearch(v); resetPage(); }} />
        }
      />

      <EntityFormModal open={createOpen} onOpenChange={setCreateOpen} title="Tambah Personil">
        <PersonilForm
          submitting={createM.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createM.mutate(values, { onSuccess: () => setCreateOpen(false) })}
        />
      </EntityFormModal>

      <EntityFormModal open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)} title="Ubah Personil">
        {editRow && (
          <PersonilForm
            defaultValues={{
              nip: editRow.nip,
              nama: editRow.nama,
              jabatan: editRow.jabatan,
              rtuppId: editRow.rtuppId,
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
        title={`Hapus personil ${deleteRow?.nama ?? ""}?`}
        isPending={deleteM.isPending}
        onConfirm={() => deleteRow && deleteM.mutate(deleteRow.id, { onSuccess: () => setDeleteRow(null) })}
      />
    </div>
  );
}
