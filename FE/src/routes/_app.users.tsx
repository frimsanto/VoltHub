import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Plus, Pencil, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { ListToolbar, FilterSelect } from "@/components/v2/ListToolbar";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { ActiveBadge } from "@/components/v2/StatusBadge";
import { requireV2Role, USER_MGMT_ROLES } from "@/lib/v2/route-guards";
import { useCan, useV2Role, toV2Role, displayRole } from "@/lib/v2/rbac";
import type { User } from "@/lib/api/users";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useResetUserPassword,
} from "@/features/v2/admin/hooks";
import { UserForm, ResetPasswordForm } from "@/features/v2/admin/forms";

export const Route = createFileRoute("/_app/users")({
  beforeLoad: () => requireV2Role(USER_MGMT_ROLES),
  component: UsersPage,
  head: () => ({ meta: [{ title: "Users — VoltHub" }] }),
});

function UsersPage() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 100 });
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<User | null>(null);
  const [resetRow, setResetRow] = useState<User | null>(null);
  const [deleteRow, setDeleteRow] = useState<User | null>(null);

  const query = useUsers({ search: search || undefined, role });
  const createM = useCreateUser();
  const updateM = useUpdateUser();
  const deleteM = useDeleteUser();
  const resetM = useResetUserPassword();

  // Write access mirrors the backend: MASTER, MANAGER and ADMIN may manage user
  // accounts (the one write area MANAGER holds). MANAGER/ADMIN are limited to
  // PETUGAS+ADMIN targets, so action controls are hidden for MANAGER/MASTER rows
  // unless the operator is MASTER. The backend re-enforces every rule.
  const canManage = useCan("users.manage");
  const v2role = useV2Role();
  const isMaster = v2role === "MASTER";
  // May the operator act on a target account (edit/reset/delete)?
  const canManageTarget = (target: User) => {
    if (isMaster) return true;
    const t = toV2Role(target.role);
    if (v2role === "MANAGER") {
      return t === "PETUGAS" || t === "ADMIN";
    }
    if (v2role === "ADMIN") {
      return t === "PETUGAS";
    }
    return false;
  };

  const columns = useMemo<ColumnDef<User>[]>(
    () => {
      const cols: ColumnDef<User>[] = [
        { header: "Nama", accessorKey: "name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
        { header: "Email", accessorKey: "email" },
        // MANAGER ber-RTUPP tampil sebagai "Asisten Manager" (ASMEN) — bukan role baru.
        { header: "Role", accessorKey: "role", cell: ({ row }) => <Badge variant="secondary">{displayRole(toV2Role(row.original.role), row.original.rtupp?.id)}</Badge> },
        { header: "RTUPP", id: "rtupp", cell: ({ row }) => row.original.rtupp?.code ?? "—" },
        { header: "Status", accessorKey: "isActive", cell: ({ row }) => <ActiveBadge active={row.original.isActive} /> },
      ];
      if (!canManage) return cols;
      cols.push({
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => {
          // MANAGER/ADMIN may only touch PETUGAS+ADMIN accounts; MASTER any
          // account except a MASTER may never be deleted.
          const manageable = canManageTarget(row.original);
          const deletable = manageable && toV2Role(row.original.role) !== "MASTER";
          return (
            <div className="flex items-center justify-end gap-1">
              {manageable && (
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditRow(row.original)} aria-label="Ubah">
                  <Pencil className="size-4" />
                </Button>
              )}
              {manageable && (
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setResetRow(row.original)} aria-label="Reset password">
                  <KeyRound className="size-4" />
                </Button>
              )}
              {deletable && (
                <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => setDeleteRow(row.original)} aria-label="Hapus">
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          );
        },
      });
      return cols;
    },
    [canManage, isMaster, v2role],
  );

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manajemen akun pengguna (MASTER / MANAGER / ADMIN / PETUGAS)."
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Tambah User
            </Button>
          ) : null
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
          <ListToolbar
            searchPlaceholder="Cari nama / email…"
            onSearch={(v) => { setSearch(v); resetPage(); }}
            filters={
              <FilterSelect
                value={role}
                onChange={(v) => { setRole(v); resetPage(); }}
                placeholder="Semua Role"
                options={[
                  { value: "PETUGAS", label: "Petugas" },
                  { value: "ADMIN", label: "Admin" },
                  { value: "MANAGER", label: "Manager" },
                  { value: "MASTER", label: "Master" },
                  { value: "NOC", label: "NOC" },
                ]}
              />
            }
          />
        }
      />

      {/* Create */}
      <EntityFormModal open={createOpen} onOpenChange={setCreateOpen} title="Tambah User" className="sm:max-w-xl">
        <UserForm
          submitting={createM.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createM.mutate(values as never, { onSuccess: () => setCreateOpen(false) })}
        />
      </EntityFormModal>

      {/* Edit */}
      <EntityFormModal open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)} title="Ubah User" className="sm:max-w-xl">
        {editRow && (
          <UserForm
            isEdit
            defaultValues={{
              name: editRow.name,
              role: toV2Role(editRow.role),
              phone: editRow.phone ?? null,
              rtuppName: editRow.rtupp?.name ?? null,
              teamName: editRow.team?.name ?? null,
              isActive: editRow.isActive,
            }}
            submitting={updateM.isPending}
            onCancel={() => setEditRow(null)}
            onSubmit={(values) => updateM.mutate({ id: editRow.id, body: values as never }, { onSuccess: () => setEditRow(null) })}
          />
        )}
      </EntityFormModal>

      {/* Reset password */}
      <EntityFormModal open={!!resetRow} onOpenChange={(o) => !o && setResetRow(null)} title={`Reset Password — ${resetRow?.name ?? ""}`}>
        {resetRow && (
          <ResetPasswordForm
            submitting={resetM.isPending}
            onCancel={() => setResetRow(null)}
            onSubmit={(values) => resetM.mutate({ id: resetRow.id, password: values.password }, { onSuccess: () => setResetRow(null) })}
          />
        )}
      </EntityFormModal>

      {/* Delete */}
      <ConfirmDeleteDialog
        open={!!deleteRow}
        onOpenChange={(o) => !o && setDeleteRow(null)}
        title={`Hapus user ${deleteRow?.name ?? ""}?`}
        isPending={deleteM.isPending}
        onConfirm={() => deleteRow && deleteM.mutate(deleteRow.id, { onSuccess: () => setDeleteRow(null) })}
      />
    </div>
  );
}
