import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  FileStack,
  Clock,
  CheckCircle2,
  XCircle,
  FilePen,
  FileText,
  FileCheck2,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { showSuccess, showError } from "@/lib/swal";
import {
  ReportLoading,
  ReportStatusBadge,
  LaporanAwalDetailView,
  LaporanAkhirDetailView,
} from "@/features/report";
import { getById as getAwalById, type LaporanAwal } from "@/lib/api/laporanAwal";
import { getById as getAkhirById, type LaporanAkhir } from "@/lib/api/laporanAkhir";
import * as rekapAwal from "@/lib/api/rekap";
import * as rekapAkhir from "@/lib/api/rekapAkhir";
import { cn } from "@/lib/utils";

type Jenis = "AWAL" | "AKHIR";
type StatusFilter = "all" | "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "REVISED";

type MonitoringSearch = {
  jenis?: Jenis;
  search?: string;
  status?: StatusFilter;
  startDate?: string;
  endDate?: string;
  page?: number;
};

export const Route = createFileRoute("/_app/laporan-monitoring")({
  // Monitoring laporan lapangan — read-only untuk MASTER/MANAGER/ADMIN.
  beforeLoad: () => requireV2Role(OPS_ROLES),
  validateSearch: (s: Record<string, unknown>): MonitoringSearch => {
    const out: MonitoringSearch = {};
    // Default = AWAL (diomit dari URL). Laporan Akhir dipensiunkan dari alur
    // lapangan (diganti Laporan WO), jadi tab AKHIR hanya arsip legacy.
    if (s.jenis === "AKHIR") out.jenis = "AKHIR";
    if (typeof s.search === "string" && s.search.trim()) out.search = s.search;
    if (
      s.status === "DRAFT" ||
      s.status === "PENDING" ||
      s.status === "APPROVED" ||
      s.status === "REJECTED" ||
      s.status === "REVISED"
    )
      out.status = s.status;
    if (typeof s.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.startDate))
      out.startDate = s.startDate;
    if (typeof s.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.endDate))
      out.endDate = s.endDate;
    const p = Number(s.page);
    if (Number.isFinite(p) && p > 1) out.page = Math.floor(p);
    return out;
  },
  component: LaporanMonitoring,
  head: () => ({ meta: [{ title: "Monitoring Laporan — VoltHub" }] }),
});

function LaporanMonitoring() {
  const sp = Route.useSearch();
  const navigate = Route.useNavigate();
  const [detail, setDetail] = useState<{ id: string; jenis: Jenis; reportId: string } | null>(null);
  const perPage = 15;

  const jenis: Jenis = sp.jenis ?? "AWAL";
  const q = sp.search ?? "";
  const status = sp.status ?? "all";
  const startDate = sp.startDate ?? "";
  const endDate = sp.endDate ?? "";
  const page = sp.page ?? 1;

  // Pilih modul data sesuai jenis terpilih. Keduanya mengekspor API identik
  // (getRekap / exportRekap / getCellValue / COLUMN_DEFS) sehingga bisa dipertukarkan.
  // Cast ke satu tipe modul agar TS tidak melihat union of function signatures
  // (kedua modul punya API & bentuk data identik; baris di-cast ke any saat dipakai).
  const mod = (jenis === "AKHIR" ? rekapAkhir : rekapAwal) as typeof rekapAkhir;
  const columns = mod.COLUMN_DEFS;

  const updateSearch = (patch: Partial<MonitoringSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const { data: response, isLoading: loading } = useQuery({
    queryKey: ["rekap", jenis, { q, status, startDate, endDate, page }],
    queryFn: () =>
      mod.getRekap({
        search: q || undefined,
        status: status === "all" ? undefined : status,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit: perPage,
      }),
  });

  const rows = (response?.items ?? []) as any[];
  const summaryData = response?.summary;
  const total = response?.pagination?.total ?? 0;
  const totalPages = response?.pagination?.totalPages ?? 1;

  const { data: detailData, isLoading: detailLoading } = useQuery<LaporanAwal | LaporanAkhir>({
    queryKey: ["report-detail", detail?.jenis, detail?.id],
    enabled: !!detail,
    queryFn: () =>
      detail?.jenis === "AKHIR" ? getAkhirById(detail.id) : getAwalById(detail!.id),
  });

  const [xlsxLoading, setXlsxLoading] = useState(false);
  async function handleExport() {
    setXlsxLoading(true);
    try {
      // Export "lengkap" — semua kolom yang tersedia untuk jenis ini, mengikuti filter aktif.
      await mod.exportRekap({
        search: q || undefined,
        status: status === "all" ? undefined : status,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        columns: columns.map((c) => c.key).join(","),
      });
      showSuccess("Excel berhasil diunduh", `Laporan ${jenis === "AKHIR" ? "Akhir" : "Awal"} sesuai filter.`);
    } catch {
      showError("Gagal mengunduh Excel", "Periksa koneksi atau coba lagi.");
    } finally {
      setXlsxLoading(false);
    }
  }

  const setJenis = (j: Jenis) =>
    navigate({ search: () => (j === "AKHIR" ? { jenis: "AKHIR" } : {}), replace: true });

  const summary = [
    { key: "all" as const, label: "Total", value: summaryData?.total ?? 0, icon: FileStack, color: "text-pln-blue bg-primary/10" },
    { key: "PENDING" as const, label: "Pending", value: summaryData?.pending ?? 0, icon: Clock, color: "text-warning bg-warning/15" },
    { key: "APPROVED" as const, label: "Approved", value: summaryData?.approved ?? 0, icon: CheckCircle2, color: "text-success bg-success/10" },
    { key: "REJECTED" as const, label: "Rejected", value: summaryData?.rejected ?? 0, icon: XCircle, color: "text-destructive bg-destructive/10" },
    { key: "DRAFT" as const, label: "Draft", value: summaryData?.draft ?? 0, icon: FilePen, color: "text-muted-foreground bg-muted" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoring Laporan"
        description="Pilih jenis laporan, pantau seluruh datanya, dan ekspor ke Excel."
        actions={
          <Button variant="outline" className="rounded-xl" onClick={handleExport} disabled={xlsxLoading}>
            {xlsxLoading ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-4 mr-2" />
            )}
            Export Excel
          </Button>
        }
      />

      {/* Filter jenis utama — pilih dulu Awal atau Akhir */}
      <div className="inline-flex rounded-xl border border-border/60 bg-card p-1 shadow-soft">
        {([
          { j: "AWAL" as const, label: "Laporan Awal", icon: FileText },
          { j: "AKHIR" as const, label: "Laporan Akhir", icon: FileCheck2 },
        ]).map(({ j, label, icon: Icon }) => (
          <button
            key={j}
            type="button"
            onClick={() => setJenis(j)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
              jenis === j
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Ringkasan per status — klik untuk memfilter */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {summary.map((s) => {
          const activeCard = (status === "all" && s.key === "all") || status === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => updateSearch({ status: s.key === "all" ? undefined : s.key, page: undefined })}
              className={cn(
                "text-left rounded-2xl border p-4 shadow-soft transition hover:shadow-md bg-card",
                activeCard ? "border-primary ring-1 ring-primary" : "border-border/60",
              )}
            >
              <div className={cn("size-9 rounded-xl flex items-center justify-center mb-2", s.color)}>
                <s.icon className="size-5" />
              </div>
              <div className="text-2xl font-bold tabular-nums">{s.value}</div>
              <div className="text-xs font-medium text-muted-foreground">{s.label}</div>
            </button>
          );
        })}
      </div>

      {/* Filter */}
      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari ID, petugas, lokasi..."
              value={q}
              onChange={(e) => updateSearch({ search: e.target.value || undefined, page: undefined })}
              className="pl-9 rounded-xl"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) =>
              updateSearch({ status: v === "all" ? undefined : (v as StatusFilter), page: undefined })
            }
          >
            <SelectTrigger className="w-[150px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="REVISED">Revised</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => updateSearch({ startDate: e.target.value || undefined, page: undefined })}
            className="w-[150px] rounded-xl"
            aria-label="Tanggal mulai"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => updateSearch({ endDate: e.target.value || undefined, page: undefined })}
            className="w-[150px] rounded-xl"
            aria-label="Tanggal akhir"
          />
          <Badge variant="secondary" className="ml-auto rounded-full px-3">
            {total} laporan
          </Badge>
        </CardContent>
      </Card>

      {/* Tabel — SEMUA kolom untuk jenis terpilih */}
      <Card className="rounded-2xl shadow-soft border-border/60 overflow-hidden">
        {loading ? (
          <ReportLoading />
        ) : (
          <>
            {/* Mobile (< md): one card per report — sticky-column table is desktop-only. */}
            <div className="space-y-3 p-4 md:hidden">
              {rows.map((r, i) => (
                <div key={r.id} className="rounded-xl border border-border/60 bg-card p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      #{(page - 1) * perPage + i + 1}
                    </span>
                    <ReportStatusBadge status={r.status} />
                  </div>
                  <dl className="space-y-1.5 text-sm">
                    {columns
                      .filter((c) => c.key !== "status")
                      .map((c) => (
                        <div key={c.key} className="flex items-start justify-between gap-3">
                          <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {c.label}
                          </dt>
                          <dd className="min-w-0 wrap-break-word text-right">
                            {mod.getCellValue(r, c.key)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  <div className="flex justify-end border-t border-border/50 pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-lg"
                      title="Lihat detail"
                      aria-label="Lihat detail"
                      onClick={() => setDetail({ id: r.id, jenis, reportId: r.reportId })}
                    >
                      <Eye className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {rows.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  Tidak ada laporan ditemukan
                </div>
              )}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-3 font-semibold sticky left-0 bg-muted z-20 shadow-[8px_0_8px_-8px_rgba(0,0,0,0.15)]">
                      No
                    </th>
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        className="text-left px-3 py-3 font-semibold whitespace-nowrap"
                        style={{ minWidth: c.width }}
                      >
                        {c.label}
                      </th>
                    ))}
                    <th className="text-right px-3 py-3 font-semibold sticky right-0 bg-muted z-20 border-l border-border shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="group border-t border-border/60 transition">
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground sticky left-0 bg-card group-hover:bg-muted/30 z-10 shadow-[8px_0_8px_-8px_rgba(0,0,0,0.12)]">
                        {(page - 1) * perPage + i + 1}
                      </td>
                      {columns.map((c) => (
                        <td key={c.key} className="px-3 py-2.5 whitespace-nowrap group-hover:bg-muted/30">
                          {c.key === "status" ? (
                            <ReportStatusBadge status={r.status} />
                          ) : (
                            <span className="block max-w-[280px] truncate" title={mod.getCellValue(r, c.key)}>
                              {mod.getCellValue(r, c.key)}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right sticky right-0 bg-card group-hover:bg-muted/30 z-10 border-l border-border shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)]">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-lg"
                          title="Lihat detail"
                          aria-label="Lihat detail"
                          onClick={() => setDetail({ id: r.id, jenis, reportId: r.reportId })}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 2} className="text-center py-12 text-muted-foreground">
                        Tidak ada laporan ditemukan
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between p-4 border-t border-border/60">
              <div className="text-xs text-muted-foreground">
                Halaman {page} dari {totalPages}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  aria-label="Halaman sebelumnya"
                  disabled={page === 1}
                  onClick={() => updateSearch({ page: page - 1 <= 1 ? undefined : page - 1 })}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  aria-label="Halaman berikutnya"
                  disabled={page >= totalPages}
                  onClick={() => updateSearch({ page: page + 1 })}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Detail (read-only) */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail {detail?.reportId}</DialogTitle>
          </DialogHeader>
          {detailLoading || !detailData ? (
            <ReportLoading />
          ) : detail?.jenis === "AKHIR" ? (
            <LaporanAkhirDetailView laporan={detailData as LaporanAkhir} />
          ) : (
            <LaporanAwalDetailView laporan={detailData as LaporanAwal} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
