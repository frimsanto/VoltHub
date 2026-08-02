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
import { createGiReportOrQueue } from "@/lib/offline/sync";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { ListToolbar, DateRangeFilter } from "@/components/v2/ListToolbar";
import { RowActions } from "@/components/v2/RowActions";
import { GiStatusBadge, GiComparisonBadge } from "@/components/v2/GiStatusBadge";
import {
  inspeksiGi,
  useSubmitInspeksiGi,
  type InspeksiGiRow,
  type CreateInspeksiGi,
} from "@/features/v2/inspeksi-gi/resource";
import { InspeksiGiForm } from "@/features/v2/inspeksi-gi/InspeksiGiForm";

// Form GI = PETUGAS/ADMIN/MASTER, dan hanya untuk RTUPP1 (unit GIS). MASTER
// (global) diizinkan untuk keperluan validasi lintas-RTUPP.
function requireGiAccess(): void {
  requireAuth();
  const user = useAuthStore.getState().user;
  const role = toV2Role(user?.role);
  if (!["PETUGAS", "ADMIN", "MASTER"].includes(role)) {
    throw redirect({ to: "/unauthorized" });
  }
  if (role !== "MASTER" && !isRtupp1User(user)) {
    throw redirect({ to: "/unauthorized" });
  }
}

export const Route = createFileRoute("/_app/inspeksi-gi")({
  beforeLoad: () => requireGiAccess(),
  validateSearch: (s: Record<string, unknown>): { wo?: string } =>
    typeof s.wo === "string" ? { wo: s.wo } : {},
  component: InspeksiGiPage,
  head: () => ({ meta: [{ title: "Laporan GI — VoltHub" }] }),
});

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

function InspeksiGiPage() {
  const navigate = useNavigate();
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/inspeksi-gi/$id");
  const qc = useQueryClient();
  // Pemisahan peran: hanya PETUGAS (tim lapangan) yang mengisi laporan.
  // ADMIN/MASTER hanya melihat & memvalidasi (tanpa tombol "Buat").
  const isPetugas = useV2Role() === "PETUGAS";
  const submitM = useSubmitInspeksiGi();
  const { wo: woParam } = Route.useSearch();

  // Pembuatan Laporan GI HANYA dari Work Order (woParam ter-set). Tanpa woParam →
  // halaman ini murni RIWAYAT read-only (tanpa tombol "Buat"). Jalur tanpa-WO dicabut.
  const [mode, setMode] = useState<"list" | "create">(woParam ? "create" : "list");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // ?wo= dievaluasi ulang tiap kali berubah dan diverifikasi terhadap laporan existing:
  // sudah ada → redirect ke edit; belum ada → form create. Tidak pernah diam-diam jatuh ke list.
  const woLookupQ = inspeksiGi.useList({ workOrderId: woParam }, { enabled: !!woParam });
  const existingForWo = woLookupQ.data?.items?.[0];

  useEffect(() => {
    if (!woParam) {
      setMode("list");
      return;
    }
    if (woLookupQ.isLoading) return;
    if (existingForWo) {
      navigate({ to: "/inspeksi-gi/$id", params: { id: existingForWo.id }, replace: true });
      return;
    }
    setMode("create");
  }, [woParam, woLookupQ.isLoading, existingForWo, navigate]);

  const query = inspeksiGi.useList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    dateFrom,
    dateTo,
  });

  const columns = useMemo<ColumnDef<InspeksiGiRow>[]>(
    () => [
      { header: "Tanggal", accessorKey: "reportDate", cell: ({ row }) => <span className="font-medium">{fmtDate(row.original.reportDate)}</span> },
      { header: "Gardu Induk", accessorKey: "location", cell: ({ row }) => row.original.location?.name ?? "—" },
      { header: "Penyulang", accessorKey: "feeder", cell: ({ row }) => row.original.feeder?.feederName ?? "—" },
      { header: "Status", accessorKey: "status", cell: ({ row }) => <GiStatusBadge status={row.original.status} /> },
      { header: "Master", accessorKey: "comparisonResult", cell: ({ row }) => <GiComparisonBadge value={row.original.comparisonResult} /> },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => <RowActions onView={() => navigate({ to: "/inspeksi-gi/$id", params: { id: row.original.id } })} />,
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
          title="Buat Laporan GI"
          description="Laporan teknis Gardu Induk (RTUPP1) — tertaut Work Order."
          actions={
            <Button variant="outline" onClick={() => setMode("list")}>
              <ArrowLeft className="size-4" /> Kembali
            </Button>
          }
        />
        <InspeksiGiForm
          initial={woParam ? { workOrderId: woParam } : undefined}
          submitting={submitting}
          onCancel={() => setMode("list")}
          onSubmit={async (values: CreateInspeksiGi, intent) => {
            setSubmitting(true);
            try {
              // BE selalu membuat DRAFT; submit = endpoint terpisah (dipanggil bila perlu).
              const res = await createGiReportOrQueue<InspeksiGiRow>(
                "inspeksi-gi",
                "/gi/inspeksi",
                values,
                `Laporan GI · ${fmtDate(values.reportDate)}`,
              );
              if (res.queued) {
                toast.success("Disimpan offline", { description: "Akan dikirim otomatis saat online." });
                setMode("list");
              } else if (res.result) {
                if (intent === "SUBMITTED") {
                  await submitM.mutateAsync(res.result.id);
                } else {
                  toast.success("Draft disimpan");
                }
                qc.invalidateQueries({ queryKey: inspeksiGi.keys.lists() });
                navigate({ to: "/inspeksi-gi/$id", params: { id: res.result.id } });
              }
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
        title="Laporan GI"
        description={
          isPetugas
            ? "Riwayat Laporan GI Anda (RTUPP1). Membuat laporan baru dilakukan dari Work Order."
            : "Riwayat & tinjauan Laporan GI dari tim lapangan (RTUPP1)."
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
        onRowClick={(row) => navigate({ to: "/inspeksi-gi/$id", params: { id: row.id } })}
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
    </div>
  );
}
