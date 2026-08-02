import { createFileRoute, useNavigate, Outlet, useMatches } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES, FIELD_ONLY_ROLES } from "@/lib/v2/route-guards";
import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Plus, ClipboardList, Clock, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { ListToolbar, FilterSelect } from "@/components/v2/ListToolbar";
import { RowActions } from "@/components/v2/RowActions";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { RoleGate } from "@/components/v2/RoleGate";
import { WorkOrderStatusBadge, WorkOrderTypeBadge } from "@/components/v2/StatusBadge";
import { StatCard } from "@/features/v2/dashboard/widgets";
import { locationLabel as fmtLoc } from "@/lib/utils";
import { useCan, useV2Role } from "@/lib/v2/rbac";
import { WO_STATUSES, WO_STATUS_LABELS, WO_TYPES, WO_TYPE_LABELS, toOptions } from "@/lib/v2/enums";
import {
  workOrders,
  useWorkOrderStats,
  type WorkOrder,
  type WorkOrderFormValues,
  type WorkOrderStatus,
  type WorkOrderType,
} from "@/features/v2/work-orders/resource";
import { WorkOrderForm } from "@/features/v2/work-orders/WorkOrderForm";
import { WorkOrderInsights } from "@/features/v2/work-orders/WorkOrderInsights";
import { WorkOrderMobileList } from "@/features/v2/work-orders/WorkOrderMobileList";

// PETUGAS may open this page too (sees only their assigned WOs, server-scoped).
const WO_VIEW_ROLES = [...OPS_ROLES, ...FIELD_ONLY_ROLES] as const;

export const Route = createFileRoute("/_app/work-order")({
  beforeLoad: () => requireV2Role(WO_VIEW_ROLES),
  component: WorkOrderPage,
  head: () => ({ meta: [{ title: "Work Order — VoltHub" }] }),
});

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : "—";

// Edit is only for the pre-execution stages — once work starts (ON_PROGRESS and
// beyond) the WO record locks; editing must go through the workflow actions instead.
const EDITABLE_WO_STATUSES: WorkOrderStatus[] = ["DRAFT", "ASSIGNED"];

// Per-row lifecycle accent (2px left border) so status is scannable at a glance.
const WO_STATUS_ACCENT: Record<WorkOrderStatus, string> = {
  DRAFT: "border-l-2 border-l-muted-foreground/40",
  ASSIGNED: "border-l-2 border-l-primary",
  ON_PROGRESS: "border-l-2 border-l-warning",
  WAITING_APPROVAL: "border-l-2 border-l-info",
  APPROVED: "border-l-2 border-l-success",
  REJECTED: "border-l-2 border-l-destructive",
  CLOSED: "border-l-2 border-l-success",
};

function WorkOrderPage() {
  const navigate = useNavigate();
  const role = useV2Role();
  const isPetugas = role === "PETUGAS";
  const canManage = useCan("workOrders.manage");
  const canCreate = useCan("workOrders.create");
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/work-order/$id");

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<WorkOrderStatus | undefined>();
  const [type, setType] = useState<WorkOrderType | undefined>();

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<WorkOrder | null>(null);
  const [deleteRow, setDeleteRow] = useState<WorkOrder | null>(null);

  const listParams = {
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    status,
    type,
    mine: isPetugas || undefined,
  };
  const query = workOrders.useList(listParams);
  const stats = useWorkOrderStats(isPetugas ? { mine: true } : undefined);
  const createM = workOrders.useCreate();
  const updateM = workOrders.useUpdate();
  const removeM = workOrders.useRemove();

  const columns = useMemo<ColumnDef<WorkOrder>[]>(
    () => [
      {
        header: "No. WO",
        accessorKey: "woNumber",
        cell: ({ row }) => <span className="font-medium">{row.original.woNumber}</span>,
      },
      { header: "Jenis", cell: ({ row }) => <WorkOrderTypeBadge type={row.original.type} /> },
      { header: "Judul", cell: ({ row }) => row.original.title },
      {
        header: "Lokasi",
        cell: ({ row }) =>
          row.original.location
            ? fmtLoc(row.original.location.code, row.original.location.name)
            : "—",
      },
      {
        header: "Status",
        cell: ({ row }) => <WorkOrderStatusBadge status={row.original.status} />,
      },
      { header: "Tim", cell: ({ row }) => row.original.team?.name ?? "—" },
      { header: "Jatuh Tempo", cell: ({ row }) => fmtDate(row.original.dueDate) },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => (
          <RowActions
            canWrite={canManage}
            onView={() => navigate({ to: "/work-order/$id", params: { id: row.original.id } })}
            onEdit={
              canManage && EDITABLE_WO_STATUSES.includes(row.original.status)
                ? () => setEditRow(row.original)
                : undefined
            }
            onDelete={canManage ? () => setDeleteRow(row.original) : undefined}
          />
        ),
      },
    ],
    [canManage, navigate],
  );

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  if (showingDetail) return <Outlet />;

  return (
    <div>
      {/* Mobile (<768px) — bespoke native card list (Screen 2), PETUGAS only.
          Negative margins bleed out of PageContainer's padding for edge-to-edge
          cards; every other role/breakpoint keeps the DataTable below untouched. */}
      {isPetugas && (
        <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 md:hidden">
          <WorkOrderMobileList />
        </div>
      )}

      <div className={isPetugas ? "hidden md:block" : undefined}>
        <PageHeader
          title="Work Order"
          description="Penugasan & siklus pekerjaan lapangan: SCADA Event → WO → Tim → Laporan → Approval → Selesai."
          actions={
            <RoleGate capability="workOrders.create">
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" /> Buat Work Order
              </Button>
            </RoleGate>
          }
        />

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <StatCard
            icon={ClipboardList}
            label="WO Aktif"
            value={stats.data?.open}
            loading={stats.isLoading}
            tone="text-blue-600 bg-blue-500/10"
          />
          <StatCard
            icon={Clock}
            label="Menunggu Approval"
            value={stats.data?.waiting}
            loading={stats.isLoading}
            tone="text-amber-600 bg-amber-500/10"
          />
          <StatCard
            icon={CheckCircle2}
            label="Selesai"
            value={stats.data?.closed}
            loading={stats.isLoading}
            tone="text-green-600 bg-green-500/10"
          />
          <StatCard
            icon={XCircle}
            label="Tidak Sesuai"
            value={stats.data?.rejected}
            loading={stats.isLoading}
            tone="text-red-600 bg-red-500/10"
          />
          <StatCard
            icon={AlertTriangle}
            label="Terlambat"
            value={stats.data?.overdue}
            loading={stats.isLoading}
            tone="text-red-600 bg-red-500/10"
          />
        </div>

        {!isPetugas && <WorkOrderInsights />}

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
          onRowClick={(row) => navigate({ to: "/work-order/$id", params: { id: row.id } })}
          rowClassName={(row) => WO_STATUS_ACCENT[row.status]}
          toolbar={
            <ListToolbar
              searchPlaceholder="Cari nomor / judul…"
              onSearch={(v) => {
                setSearch(v);
                resetPage();
              }}
              filters={
                <>
                  <FilterSelect
                    value={status}
                    onChange={(v) => {
                      setStatus(v as WorkOrderStatus | undefined);
                      resetPage();
                    }}
                    placeholder="Semua Status"
                    options={toOptions(WO_STATUSES, WO_STATUS_LABELS)}
                  />
                  <FilterSelect
                    value={type}
                    onChange={(v) => {
                      setType(v as WorkOrderType | undefined);
                      resetPage();
                    }}
                    placeholder="Semua Jenis"
                    options={toOptions(WO_TYPES, WO_TYPE_LABELS)}
                  />
                </>
              }
            />
          }
        />

        <EntityFormModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="Buat Work Order"
          className="flex max-h-[85vh] flex-col overflow-y-hidden sm:max-w-lg"
        >
          <WorkOrderForm
            submitting={createM.isPending}
            onCancel={() => setCreateOpen(false)}
            onSubmit={(values) => createM.mutate(values, { onSuccess: () => setCreateOpen(false) })}
          />
        </EntityFormModal>

        <EntityFormModal
          open={!!editRow}
          onOpenChange={(o) => !o && setEditRow(null)}
          title="Edit Work Order"
          className="flex max-h-[85vh] flex-col overflow-y-hidden sm:max-w-lg"
        >
          {editRow && (
            <WorkOrderForm
              mode="edit"
              defaultValues={editRow as unknown as WorkOrderFormValues}
              submitting={updateM.isPending}
              onCancel={() => setEditRow(null)}
              onSubmit={(values) =>
                updateM.mutate(
                  { id: editRow.id, body: values },
                  { onSuccess: () => setEditRow(null) },
                )
              }
            />
          )}
        </EntityFormModal>

        <ConfirmDeleteDialog
          open={!!deleteRow}
          onOpenChange={(o) => !o && setDeleteRow(null)}
          title={`Hapus Work Order ${deleteRow?.woNumber ?? ""}?`}
          isPending={removeM.isPending}
          onConfirm={() =>
            deleteRow && removeM.mutate(deleteRow.id, { onSuccess: () => setDeleteRow(null) })
          }
        />
      </div>
    </div>
  );
}
