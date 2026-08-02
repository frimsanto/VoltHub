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
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { ListToolbar, DateRangeFilter } from "@/components/v2/ListToolbar";
import { RowActions } from "@/components/v2/RowActions";
import { GiStatusBadge } from "@/components/v2/GiStatusBadge";
import { harGi, useSubmitHarGi, type HarGiRow, type CreateHarGi } from "@/features/v2/har-gi/resource";
import { HarGiForm, type SubmitIntent } from "@/features/v2/har-gi/HarGiForm";

function requireGiAccess(): void {
  requireAuth();
  const user = useAuthStore.getState().user;
  const role = toV2Role(user?.role);
  if (!["PETUGAS", "ADMIN", "MASTER"].includes(role)) throw redirect({ to: "/unauthorized" });
  if (role !== "MASTER" && !isRtupp1User(user)) throw redirect({ to: "/unauthorized" });
}

export const Route = createFileRoute("/_app/har-gi")({
  beforeLoad: () => requireGiAccess(),
  validateSearch: (s: Record<string, unknown>): { wo?: string } =>
    typeof s.wo === "string" ? { wo: s.wo } : {},
  component: HarGiPage,
  head: () => ({ meta: [{ title: "Laporan HAR GI — VoltHub" }] }),
});

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

function HarGiPage() {
  const navigate = useNavigate();
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/har-gi/$id");
  const qc = useQueryClient();
  const isPetugas = useV2Role() === "PETUGAS";
  const submitM = useSubmitHarGi();
  const { wo: woParam } = Route.useSearch();

  // Pembuatan Laporan HAR GI HANYA dari Work Order (woParam ter-set). Tanpa woParam →
  // halaman ini murni RIWAYAT read-only (tanpa tombol "Buat"). Tidak ada jalur Tanpa-WO.
  const [mode, setMode] = useState<"list" | "create">(woParam ? "create" : "list");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // ?wo= dievaluasi ulang tiap kali berubah dan diverifikasi terhadap laporan existing:
  // sudah ada → redirect ke edit; belum ada → form create. Tidak pernah diam-diam jatuh ke list.
  const woLookupQ = harGi.useList({ workOrderId: woParam }, { enabled: !!woParam });
  const existingForWo = woLookupQ.data?.items?.[0];

  useEffect(() => {
    if (!woParam) {
      setMode("list");
      return;
    }
    if (woLookupQ.isLoading) return;
    if (existingForWo) {
      navigate({ to: "/har-gi/$id", params: { id: existingForWo.id }, replace: true });
      return;
    }
    setMode("create");
  }, [woParam, woLookupQ.isLoading, existingForWo, navigate]);

  const query = harGi.useList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    dateFrom,
    dateTo,
  });

  const columns = useMemo<ColumnDef<HarGiRow>[]>(
    () => [
      { header: "Tanggal", accessorKey: "reportDate", cell: ({ row }) => <span className="font-medium">{fmtDate(row.original.reportDate)}</span> },
      { header: "Gardu Induk", accessorKey: "location", cell: ({ row }) => row.original.location?.name ?? "—" },
      { header: "Penyulang", accessorKey: "feeder", cell: ({ row }) => row.original.feeder?.feederName ?? "—" },
      { header: "Status", accessorKey: "status", cell: ({ row }) => <GiStatusBadge status={row.original.status} /> },
      {
        header: "Gardu Sesudah",
        accessorKey: "statusGarduSesudah",
        cell: ({ row }) => {
          const s = row.original.statusGarduSesudah;
          if (!s) return "—";
          return <Badge variant={s === "INSCAN" ? "default" : "destructive"}>{s}</Badge>;
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => <RowActions onView={() => navigate({ to: "/har-gi/$id", params: { id: row.original.id } })} />,
      },
    ],
    [navigate],
  );

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  if (showingDetail) return <Outlet />;

  // Create HANYA via WO (woParam). Form WO-locked.
  if (mode === "create" && woParam) {
    return (
      <div>
        <PageHeader
          title="Buat Laporan HAR GI"
          description="Laporan korektif/pemeliharaan Gardu Induk (RTUPP1) — tertaut Work Order."
          actions={
            <Button variant="outline" onClick={() => navigate({ to: "/work-order/$id", params: { id: woParam } })}>
              <ArrowLeft className="size-4" /> Kembali ke WO
            </Button>
          }
        />
        <HarGiForm
          initial={{ workOrderId: woParam }}
          submitting={submitting}
          onCancel={() => navigate({ to: "/work-order/$id", params: { id: woParam } })}
          onSubmit={async (values: CreateHarGi, intent: SubmitIntent) => {
            setSubmitting(true);
            try {
              const res = await createGiReportOrQueue<HarGiRow>("har-gi", "/gi/har", values, `Laporan HAR GI · ${fmtDate(values.reportDate)}`);
              if (res.queued) {
                toast.success("Disimpan offline", { description: "Akan dikirim otomatis saat online." });
                navigate({ to: "/work-order/$id", params: { id: woParam } });
              } else if (res.result) {
                if (intent === "SUBMITTED") {
                  await submitM.mutateAsync(res.result.id);
                } else {
                  toast.success("Draft disimpan");
                }
                qc.invalidateQueries({ queryKey: harGi.keys.lists() });
                navigate({ to: "/har-gi/$id", params: { id: res.result.id } });
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
        title="Laporan HAR GI"
        description={
          isPetugas
            ? "Riwayat Laporan HAR GI Anda (RTUPP1). Membuat laporan baru dilakukan dari Work Order."
            : "Riwayat & tinjauan Laporan HAR GI dari tim lapangan (RTUPP1)."
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
        onRowClick={(row) => navigate({ to: "/har-gi/$id", params: { id: row.id } })}
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
