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
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/v2/StatusBadge";
import { locationLabel as fmtLoc } from "@/lib/utils";
import { useCan } from "@/lib/v2/rbac";
import {
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  toOptions,
} from "@/lib/v2/enums";
import { useUploadDocument } from "@/features/v2/documents/resource";
import {
  tickets,
  type Ticket,
  type TicketFormValues,
  type TicketStatus,
  type TicketPriority,
} from "@/features/v2/tickets/resource";
import { TicketForm } from "@/features/v2/tickets/TicketForm";

export const Route = createFileRoute("/_app/tickets")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: TicketsPage,
  head: () => ({ meta: [{ title: "Work Order — VoltHub" }] }),
});

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : "—";

function TicketsPage() {
  const navigate = useNavigate();
  const canWrite = useCan("tickets.write");
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/tickets/$id");

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TicketStatus | undefined>();
  const [priority, setPriority] = useState<TicketPriority | undefined>();

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Ticket | null>(null);
  const [deleteRow, setDeleteRow] = useState<Ticket | null>(null);

  const query = tickets.useList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    status,
    priority,
  });
  const createM = tickets.useCreate();
  const updateM = tickets.useUpdate();
  const removeM = tickets.useRemove();
  const uploadM = useUploadDocument();

  // Attachment is gardu-scoped (no ticket-document FK yet): tag the document name
  // with the ticket number so the detail page can surface it per-ticket.
  const handleCreate = (values: TicketFormValues, attachment?: File | null) => {
    createM.mutate(values, {
      onSuccess: (created) => {
        if (attachment) {
          uploadM.mutate({
            file: attachment,
            documentType: "OTHER",
            documentName: `[${created.ticketNumber}] ${attachment.name}`,
            locationId: created.locationId,
          });
        }
        setCreateOpen(false);
      },
    });
  };

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        header: "No. WO",
        accessorKey: "ticketNumber",
        cell: ({ row }) => <span className="font-medium">{row.original.ticketNumber}</span>,
      },
      {
        header: "Gardu",
        cell: ({ row }) =>
          row.original.location
            ? fmtLoc(row.original.location.code, row.original.location.name)
            : "—",
      },
      { header: "Dibuat", cell: ({ row }) => fmtDate(row.original.openedAt ?? row.original.createdAt) },
      { header: "Kategori", cell: ({ row }) => row.original.category ?? "—" },
      {
        header: "Prioritas",
        cell: ({ row }) => <TicketPriorityBadge priority={row.original.priority} />,
      },
      { header: "Status", cell: ({ row }) => <TicketStatusBadge status={row.original.status} /> },
      { header: "Ditugaskan", cell: ({ row }) => row.original.assignee?.name ?? "—" },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => (
          <RowActions
            canWrite={canWrite}
            onView={() => navigate({ to: "/tickets/$id", params: { id: row.original.id as string } })}
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
        title="Work Order"
        description="Work Order penanganan dan tindak lanjut gardu."
        actions={
          <RoleGate capability="tickets.create">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Buat Work Order
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
        onRowClick={(row) => navigate({ to: "/tickets/$id", params: { id: row.id as string } })}
        toolbar={
          <ListToolbar
            searchPlaceholder="Cari nomor / kategori…"
            onSearch={(v) => {
              setSearch(v);
              resetPage();
            }}
            filters={
              <>
                <FilterSelect
                  value={status}
                  onChange={(v) => {
                    setStatus(v as TicketStatus | undefined);
                    resetPage();
                  }}
                  placeholder="Semua Status"
                  options={toOptions(TICKET_STATUSES, TICKET_STATUS_LABELS)}
                />
                <FilterSelect
                  value={priority}
                  onChange={(v) => {
                    setPriority(v as TicketPriority | undefined);
                    resetPage();
                  }}
                  placeholder="Semua Prioritas"
                  options={toOptions(TICKET_PRIORITIES, TICKET_PRIORITY_LABELS)}
                />
              </>
            }
          />
        }
      />

      <EntityFormModal open={createOpen} onOpenChange={setCreateOpen} title="Buat Work Order">
        <TicketForm
          submitting={createM.isPending || uploadM.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={handleCreate}
        />
      </EntityFormModal>

      <EntityFormModal
        open={!!editRow}
        onOpenChange={(o) => !o && setEditRow(null)}
        title="Edit Work Order"
      >
        {editRow && (
          <TicketForm
            mode="edit"
            defaultValues={editRow as TicketFormValues}
            submitting={updateM.isPending}
            onCancel={() => setEditRow(null)}
            onSubmit={(values) =>
              updateM.mutate({ id: editRow.id, body: values }, { onSuccess: () => setEditRow(null) })
            }
          />
        )}
      </EntityFormModal>

      <ConfirmDeleteDialog
        open={!!deleteRow}
        onOpenChange={(o) => !o && setDeleteRow(null)}
        title={`Hapus Work Order ${deleteRow?.ticketNumber ?? ""}?`}
        isPending={removeM.isPending}
        onConfirm={() =>
          deleteRow && removeM.mutate(deleteRow.id, { onSuccess: () => setDeleteRow(null) })
        }
      />
    </div>
  );
}
