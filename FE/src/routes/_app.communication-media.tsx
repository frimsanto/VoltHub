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
import { ActiveBadge } from "@/components/v2/StatusBadge";
import { RoleGate } from "@/components/v2/RoleGate";
import { useCan } from "@/lib/v2/rbac";
import { useLocationOptions, embeddedLocationLabel } from "@/features/v2/lookups";
import { MEDIA_TYPES, MEDIA_TYPE_LABELS, toOptions, type MediaType } from "@/lib/v2/enums";
import {
  commMedia,
  type CommMediaFormValues,
  type CommMediaWithLocation,
} from "@/features/v2/communication-media/resource";
import { CommMediaForm } from "@/features/v2/communication-media/CommMediaForm";

export const Route = createFileRoute("/_app/communication-media")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: CommMediaPage,
  head: () => ({ meta: [{ title: "Communication Media — VoltHub" }] }),
});

function CommMediaPage() {
  const navigate = useNavigate();
  const canWrite = useCan("commMedia.write");
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/communication-media/$id");
  const { options: locationOptions } = useLocationOptions();

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState<string | undefined>();
  const [mediaType, setMediaType] = useState<string | undefined>();

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<CommMediaWithLocation | null>(null);
  const [deleteRow, setDeleteRow] = useState<CommMediaWithLocation | null>(null);

  const query = commMedia.useList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    locationId,
    mediaType,
  });
  const createM = commMedia.useCreate();
  const updateM = commMedia.useUpdate();
  const removeM = commMedia.useRemove();

  const columns = useMemo<ColumnDef<CommMediaWithLocation>[]>(
    () => [
      {
        header: "Tipe",
        accessorKey: "mediaType",
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.mediaType ? MEDIA_TYPE_LABELS[row.original.mediaType as MediaType] : "—"}
          </span>
        ),
      },
      {
        header: "Provider",
        accessorKey: "provider",
        cell: ({ row }) => row.original.provider ?? "—",
      },
      {
        header: "Gardu",
        accessorKey: "locationId",
        // Embedded relation (every row), not the 100-row option lookup.
        cell: ({ row }) => embeddedLocationLabel(row.original.location),
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
            onView={() =>
              navigate({
                to: "/communication-media/$id",
                params: { id: row.original.id as string },
              })
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
        title="Communication Media"
        description="Master data media komunikasi per lokasi."
        actions={
          <RoleGate capability="commMedia.write">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Tambah Media
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
        onRowClick={(row) =>
          navigate({ to: "/communication-media/$id", params: { id: row.id as string } })
        }
        toolbar={
          <ListToolbar
            searchPlaceholder="Cari provider…"
            onSearch={(v) => {
              setSearch(v);
              resetPage();
            }}
            filters={
              <>
                <FilterSelect
                  value={locationId}
                  onChange={(v) => {
                    setLocationId(v);
                    resetPage();
                  }}
                  placeholder="Semua Lokasi"
                  options={locationOptions}
                />
                <FilterSelect
                  value={mediaType}
                  onChange={(v) => {
                    setMediaType(v);
                    resetPage();
                  }}
                  placeholder="Semua Tipe"
                  options={toOptions(MEDIA_TYPES, MEDIA_TYPE_LABELS)}
                />
              </>
            }
          />
        }
      />

      <EntityFormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Tambah Communication Media"
      >
        <CommMediaForm
          submitting={createM.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createM.mutate(values, { onSuccess: () => setCreateOpen(false) })}
        />
      </EntityFormModal>

      <EntityFormModal
        open={!!editRow}
        onOpenChange={(o) => !o && setEditRow(null)}
        title="Ubah Communication Media"
      >
        {editRow && (
          <CommMediaForm
            defaultValues={editRow as CommMediaFormValues}
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
        title="Hapus media komunikasi?"
        isPending={removeM.isPending}
        onConfirm={() =>
          deleteRow &&
          removeM.mutate(deleteRow.id as string, { onSuccess: () => setDeleteRow(null) })
        }
      />
    </div>
  );
}
