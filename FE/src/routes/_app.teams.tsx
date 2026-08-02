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
import type { Team } from "@/lib/api/teams";
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam } from "@/features/v2/admin/hooks";
import { TeamForm } from "@/features/v2/admin/forms";

export const Route = createFileRoute("/_app/teams")({
  beforeLoad: () => requireV2Role(MASTER_ONLY_ROLES),
  component: TeamsPage,
  head: () => ({ meta: [{ title: "Teams — VoltHub" }] }),
});

function TeamsPage() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 100 });
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Team | null>(null);
  const [deleteRow, setDeleteRow] = useState<Team | null>(null);

  const query = useTeams({ search: search || undefined });
  const createM = useCreateTeam();
  const updateM = useUpdateTeam();
  const deleteM = useDeleteTeam();

  const columns = useMemo<ColumnDef<Team>[]>(
    () => [
      { header: "Kode", accessorKey: "code", cell: ({ row }) => <span className="font-medium">{row.original.code}</span> },
      { header: "Nama", accessorKey: "name" },
      { header: "RTUPP", id: "rtupp", cell: ({ row }) => row.original.rtupp?.code ?? "—" },
      { header: "Anggota", id: "members", cell: ({ row }) => row.original._count?.members ?? 0 },
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
        title="Teams"
        description="Tim pelaksana di bawah RTUPP."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Tambah Team
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

      <EntityFormModal open={createOpen} onOpenChange={setCreateOpen} title="Tambah Team">
        <TeamForm
          submitting={createM.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createM.mutate(values, { onSuccess: () => setCreateOpen(false) })}
        />
      </EntityFormModal>

      <EntityFormModal open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)} title="Ubah Team">
        {editRow && (
          <TeamForm
            defaultValues={{ code: editRow.code, name: editRow.name, rtuppId: editRow.rtuppId, isActive: editRow.isActive }}
            submitting={updateM.isPending}
            onCancel={() => setEditRow(null)}
            onSubmit={(values) => updateM.mutate({ id: editRow.id, body: values }, { onSuccess: () => setEditRow(null) })}
          />
        )}
      </EntityFormModal>

      <ConfirmDeleteDialog
        open={!!deleteRow}
        onOpenChange={(o) => !o && setDeleteRow(null)}
        title={`Hapus team ${deleteRow?.name ?? ""}?`}
        isPending={deleteM.isPending}
        onConfirm={() => deleteRow && deleteM.mutate(deleteRow.id, { onSuccess: () => setDeleteRow(null) })}
      />
    </div>
  );
}
