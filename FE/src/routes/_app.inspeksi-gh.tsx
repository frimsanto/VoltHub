import { createFileRoute, useNavigate, Outlet, useMatches, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/route-guards";
import { useAuthStore } from "@/stores/auth";
import { toV2Role, useV2Role } from "@/lib/v2/rbac";
import { isRtupp1User } from "@/lib/v2/rtupp";
import { v2Post } from "@/lib/api/v2";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { ListToolbar, DateRangeFilter } from "@/components/v2/ListToolbar";
import { RowActions } from "@/components/v2/RowActions";
import { GiStatusBadge } from "@/components/v2/GiStatusBadge";
import { ImportedStatusBadge, ImportedTag, ImportedInspeksiDetailDialog } from "@/components/v2/ImportedInspeksi";
import {
  inspeksiGh,
  useSubmitInspeksiGh,
  type InspeksiGhRow,
  type InspeksiGhDetail,
  type CreateInspeksiGh,
} from "@/features/v2/inspeksi-gh/resource";
import { InspeksiGhForm } from "@/features/v2/inspeksi-gh/InspeksiGhForm";

// Form Inspeksi GH = PETUGAS/ADMIN/MASTER, hanya untuk unit GH (RTUPP2-5) atau MASTER.
function requireGhAccess(): void {
  requireAuth();
  const user = useAuthStore.getState().user;
  const role = toV2Role(user?.role);
  if (!["PETUGAS", "ADMIN", "MASTER"].includes(role)) {
    throw redirect({ to: "/unauthorized" });
  }
  if (role !== "MASTER" && role !== "ADMIN" && isRtupp1User(user)) {
    throw redirect({ to: "/unauthorized" });
  }
}

export const Route = createFileRoute("/_app/inspeksi-gh")({
  beforeLoad: () => requireGhAccess(),
  validateSearch: (s: Record<string, unknown>): { wo?: string } =>
    typeof s.wo === "string" ? { wo: s.wo } : {},
  component: InspeksiGhPage,
  head: () => ({ meta: [{ title: "Laporan Inspeksi GH — VoltHub" }] }),
});

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

function InspeksiGhPage() {
  const navigate = useNavigate();
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/inspeksi-gh/$id");
  const qc = useQueryClient();
  const isPetugas = useV2Role() === "PETUGAS";
  const submitM = useSubmitInspeksiGh();
  const { wo: woParam } = Route.useSearch();

  // Pembuatan HANYA dari Work Order (woParam ter-set). Tanpa woParam → riwayat read-only.
  const [mode, setMode] = useState<"list" | "create">(woParam ? "create" : "list");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [importedDetail, setImportedDetail] = useState<InspeksiGhRow | null>(null);

  // ?wo= dievaluasi ulang tiap kali berubah dan diverifikasi terhadap laporan existing:
  // sudah ada → redirect ke edit; belum ada → form create. Tidak pernah diam-diam jatuh ke list.
  const woLookupQ = inspeksiGh.useList({ workOrderId: woParam }, { enabled: !!woParam });
  const existingForWo = woLookupQ.data?.items?.[0];

  useEffect(() => {
    if (!woParam) {
      setMode("list");
      return;
    }
    if (woLookupQ.isLoading) return;
    if (existingForWo) {
      navigate({ to: "/inspeksi-gh/$id", params: { id: existingForWo.id }, replace: true });
      return;
    }
    setMode("create");
  }, [woParam, woLookupQ.isLoading, existingForWo, navigate]);

  const query = inspeksiGh.useList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    dateFrom,
    dateTo,
  });

  const columns = useMemo<ColumnDef<InspeksiGhRow>[]>(
    () => [
      {
        header: "Tanggal",
        accessorKey: "reportDate",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{fmtDate(row.original.reportDate)}</span>
            {row.original.isImported && <ImportedTag />}
          </div>
        ),
      },
      {
        header: "Gardu Hubung",
        accessorKey: "location",
        cell: ({ row }) => row.original.location?.name ?? row.original.kodeGardu ?? "—",
      },
      { header: "WO", accessorKey: "workOrder", cell: ({ row }) => row.original.workOrder?.woNumber ?? "—" },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) =>
          row.original.isImported ? (
            <ImportedStatusBadge statusScada={row.original.statusScada} />
          ) : (
            <GiStatusBadge status={row.original.status} />
          ),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => (
          <RowActions
            onView={() =>
              row.original.isImported
                ? setImportedDetail(row.original)
                : navigate({ to: "/inspeksi-gh/$id", params: { id: row.original.id } })
            }
          />
        ),
      },
    ],
    [navigate],
  );

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  if (showingDetail) return <Outlet />;

  if (mode === "create" && isPetugas) {
    return (
      <div>
        <PageHeader
          title="Isi Inspeksi GH"
          description="Laporan preventif Gardu Hubung (RTUPP2-5) — tertaut Work Order."
          actions={
            <Button variant="outline" onClick={() => setMode("list")}>
              <ArrowLeft className="size-4" /> Kembali
            </Button>
          }
        />
        <InspeksiGhForm
          initial={woParam ? { workOrderId: woParam } : undefined}
          submitting={submitting}
          onCancel={() => setMode("list")}
          onSubmit={async (values: CreateInspeksiGh, intent) => {
            setSubmitting(true);
            try {
              const created = await v2Post<InspeksiGhDetail, CreateInspeksiGh>("/gh/inspeksi", values);
              if (intent === "SUBMITTED") {
                await submitM.mutateAsync(created.id);
              } else {
                toast.success("Draft disimpan");
              }
              qc.invalidateQueries({ queryKey: inspeksiGh.keys.lists() });
              navigate({ to: "/inspeksi-gh/$id", params: { id: created.id } });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal menyimpan laporan");
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Inspeksi GH"
        description={
          isPetugas
            ? "Riwayat Inspeksi GH Anda (RTUPP2-5). Membuat laporan baru dilakukan dari Work Order."
            : "Riwayat & tinjauan Inspeksi GH dari tim lapangan (RTUPP2-5)."
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
          row.isImported ? setImportedDetail(row) : navigate({ to: "/inspeksi-gh/$id", params: { id: row.id } })
        }
        toolbar={
          <ListToolbar
            searchPlaceholder="Cari gardu…"
            onSearch={(v) => {
              setSearch(v);
              resetPage();
            }}
            filters={
              <DateRangeFilter
                from={dateFrom}
                to={dateTo}
                onChange={({ from, to }) => {
                  setDateFrom(from);
                  setDateTo(to);
                  resetPage();
                }}
              />
            }
          />
        }
      />
      <ImportedInspeksiDetailDialog
        open={!!importedDetail}
        onOpenChange={(open) => !open && setImportedDetail(null)}
        data={importedDetail}
      />
    </div>
  );
}
