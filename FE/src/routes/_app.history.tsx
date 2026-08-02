import { createFileRoute } from "@tanstack/react-router";
import { requireV2Role, FIELD_ONLY_ROLES } from "@/lib/v2/route-guards";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  FileSpreadsheet,
  FileArchive,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Eye,
  Pencil,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  FileText,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { type HistoryItem } from "@/lib/api/history";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { showSuccess, showError } from "@/lib/swal";
import { ReportLoading, ReportJenisBadge, ReportStatusBadge, useReports } from "@/features/report";
import { getAttachmentsByLaporan, fetchAttachmentBlob, type Attachment } from "@/lib/api/upload";
import { exportXlsx, exportZip, downloadBlob } from "@/lib/api/export";

// Map jenis laporan (UPPERCASE) ke segmen path endpoint upload/export.
const JENIS_PATH: Record<string, "laporan-awal" | "laporan-akhir"> = {
  AWAL: "laporan-awal",
  AKHIR: "laporan-akhir",
};
const ZIP_JENIS: Record<string, "awal" | "akhir"> = {
  AWAL: "awal",
  AKHIR: "akhir",
};

// Status di mana PETUGAS masih boleh menyunting laporannya sendiri. Selaras
// dengan aturan backend (PETUGAS_EDITABLE_STATUSES): DRAFT belum disubmit dan
// PENDING menunggu validasi. Begitu admin memutus (APPROVED/REJECTED/REVISED)
// laporan terkunci dan tombol Edit disembunyikan.
const EDITABLE_STATUSES = new Set(["DRAFT", "PENDING"]);

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

type HistorySearch = {
  search?: string;
  status?: string;
  jenis?: string;
  page?: number;
};

export const Route = createFileRoute("/_app/history")({
  beforeLoad: () => requireV2Role(FIELD_ONLY_ROLES),
  // URL ↔ filter sync. Nilai default (all / page 1 / search kosong) sengaja TIDAK
  // ditulis ke URL agar link tetap bersih.
  validateSearch: (s: Record<string, unknown>): HistorySearch => {
    const out: HistorySearch = {};
    if (typeof s.search === "string" && s.search.trim()) out.search = s.search;
    if (typeof s.status === "string" && s.status && s.status !== "all") out.status = s.status;
    if (typeof s.jenis === "string" && s.jenis && s.jenis !== "all") out.jenis = s.jenis;
    const p = Number(s.page);
    if (Number.isFinite(p) && p > 1) out.page = Math.floor(p);
    return out;
  },
  component: History,
  head: () => ({ meta: [{ title: "History Laporan — VoltHub" }] }),
});

function History() {
  const sp = Route.useSearch();
  const navigate = Route.useNavigate();
  const [detail, setDetail] = useState<HistoryItem | null>(null);
  const perPage = 8;

  const q = sp.search ?? "";
  const status = sp.status ?? "all";
  const type = sp.jenis ?? "all";
  const page = sp.page ?? 1;

  const updateSearch = (patch: Partial<HistorySearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const { data: response, isLoading: loading } = useReports({
    jenis: type === "all" ? "ALL" : (type.toUpperCase() as "ALL" | "AWAL" | "AKHIR"),
    status:
      status === "all"
        ? undefined
        : (status.toUpperCase() as "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "REVISED"),
    search: q || undefined,
    page,
    limit: perPage,
  });

  const data: HistoryItem[] = response?.items ?? [];
  const total = response?.pagination?.total ?? 0;
  const totalPages = response?.pagination?.totalPages ?? 1;

  const [xlsxLoading, setXlsxLoading] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);

  async function handleExportZip(report: HistoryItem) {
    const zipJenis = ZIP_JENIS[report.jenis];
    if (!zipJenis) {
      showError("Jenis laporan tidak didukung");
      return;
    }
    setZipLoading(true);
    try {
      const blob = await exportZip(zipJenis, report.id);
      downloadBlob(blob, `${report.reportId}.zip`);
      showSuccess("ZIP Evidence berhasil diunduh", `Evidence untuk laporan ${report.reportId}`);
    } catch {
      showError("Gagal mengunduh ZIP", "Periksa koneksi atau coba lagi.");
    } finally {
      setZipLoading(false);
    }
  }

  async function handleExportXlsx() {
    setXlsxLoading(true);
    try {
      const blob = await exportXlsx({
        jenis: type === "all" ? "ALL" : (type.toUpperCase() as "ALL" | "AWAL" | "AKHIR"),
        status: status === "all" ? undefined : status.toUpperCase(),
      });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `VoltHub_History_${stamp}.xlsx`);
      showSuccess("XLSX berhasil diunduh");
    } catch {
      showError("Gagal mengunduh XLSX", "Periksa koneksi atau coba lagi.");
    } finally {
      setXlsxLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="History Laporan"
        description="Arsip lengkap laporan lapangan."
        actions={
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={handleExportXlsx}
            disabled={xlsxLoading}
          >
            {xlsxLoading ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-4 mr-2" />
            )}
            Export Excel (XLSX)
          </Button>
        }
      />

      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari ID, petugas, lokasi..."
              value={q}
              onChange={(e) =>
                updateSearch({ search: e.target.value || undefined, page: undefined })
              }
              className="pl-9 rounded-xl"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) =>
              updateSearch({ status: v === "all" ? undefined : v, page: undefined })
            }
          >
            <SelectTrigger className="w-[160px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="REVISED">Revised</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={type}
            onValueChange={(v) =>
              updateSearch({ jenis: v === "all" ? undefined : v, page: undefined })
            }
          >
            <SelectTrigger className="w-[160px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Jenis</SelectItem>
              <SelectItem value="AWAL">Laporan Awal</SelectItem>
              <SelectItem value="AKHIR">Laporan Akhir</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="ml-auto rounded-full px-3">
            {total ?? data.length ?? 0} laporan
          </Badge>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-soft border-border/60 overflow-hidden">
        {loading ? (
          <ReportLoading />
        ) : (
          <>
            {/* Mobile (< md): report cards — the 8-column table is unusable on phones. */}
            <div className="space-y-3 p-4 md:hidden">
              {data.map((r) => (
                <div
                  key={r.id}
                  data-testid="history-row"
                  className="rounded-xl border border-border/60 bg-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-muted-foreground">{r.reportId}</div>
                      <div className="mt-0.5 font-medium truncate">{r.createdBy?.name || "-"}</div>
                    </div>
                    <ReportJenisBadge jenis={r.jenis} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <ReportStatusBadge status={r.status} />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("id-ID")}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1 border-t border-border/50 pt-2">
                    {EDITABLE_STATUSES.has(r.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg text-primary hover:text-primary"
                        title="Edit laporan"
                        aria-label="Edit laporan"
                        data-testid="history-edit-btn-mobile"
                        onClick={() =>
                          navigate({
                            to: r.jenis === "AWAL" ? "/laporan-awal" : "/laporan-akhir",
                            search: { edit: r.id },
                          })
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-lg"
                      title="Lihat detail"
                      aria-label="Lihat detail"
                      data-testid="history-detail-btn-mobile"
                      onClick={() => setDetail(r)}
                    >
                      <Eye className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {data.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  Tidak ada laporan ditemukan
                </div>
              )}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">ID</th>
                    <th className="text-left px-4 py-3 font-semibold">Jenis</th>
                    <th className="text-left px-4 py-3 font-semibold">Petugas</th>
                    <th className="text-left px-4 py-3 font-semibold">RTUPP</th>
                    <th className="text-left px-4 py-3 font-semibold">Team</th>
                    <th className="text-left px-4 py-3 font-semibold cursor-pointer hover:text-foreground">
                      <span className="flex items-center gap-1">
                        Tanggal <ArrowUpDown className="size-3" />
                      </span>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-right px-4 py-3 font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr
                      key={r.id}
                      data-testid="history-row"
                      className="border-t border-border/60 hover:bg-muted/30 transition"
                    >
                      <td className="px-4 py-3 font-mono text-xs">{r.reportId}</td>
                      <td className="px-4 py-3">
                        <ReportJenisBadge jenis={r.jenis} />
                      </td>
                      <td className="px-4 py-3 font-medium">{r.createdBy?.name || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.createdBy?.rtupp?.name || "Belum terhubung"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.createdBy?.team?.name || "Belum terhubung"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-4 py-3">
                        <ReportStatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {EDITABLE_STATUSES.has(r.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="rounded-lg text-primary hover:text-primary"
                              title="Edit laporan"
                              aria-label="Edit laporan"
                              data-testid="history-edit-btn-desktop"
                              onClick={() =>
                                navigate({
                                  to: r.jenis === "AWAL" ? "/laporan-awal" : "/laporan-akhir",
                                  search: { edit: r.id },
                                })
                              }
                            >
                              <Pencil className="size-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-lg"
                            title="Lihat detail"
                            aria-label="Lihat detail"
                            data-testid="history-detail-btn-desktop"
                            onClick={() => setDetail(r)}
                          >
                            <Eye className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground">
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

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent
          data-testid="history-detail-dialog"
          className="max-w-3xl max-h-[85vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Detail Laporan {detail?.reportId}</DialogTitle>
            <DialogDescription>
              {detail &&
                `${detail.jenis} • ${new Date(detail.createdAt).toLocaleDateString("id-ID")}`}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="info">Informasi</TabsTrigger>
                <TabsTrigger value="timeline" data-testid="history-timeline-tab">
                  Riwayat Approval
                </TabsTrigger>
                <TabsTrigger value="attachments">Dokumentasi</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <Info label="Jenis Laporan" value={<ReportJenisBadge jenis={detail.jenis} />} />
                  <Info label="Status" value={<ReportStatusBadge status={detail.status} />} />
                  <Info label="Petugas" value={detail.createdBy?.name || "-"} />
                  <Info label="Email" value={detail.createdBy?.email || "-"} />
                  <Info label="Nomor SPJ" value={detail.nomorSPJ || "-"} />
                  <Info
                    label="Tanggal Dibuat"
                    value={new Date(detail.createdAt).toLocaleString("id-ID")}
                  />
                  {detail.jenis === "AWAL" && (
                    <>
                      <Info label="Hari" value={detail.hari || "-"} />
                      <Info label="Tanggal" value={detail.tanggal || "-"} />
                      <Info label="UP3" value={detail.up3 || "-"} />
                      <Info label="Lokasi Gardu" value={detail.lokasiGardu || "-"} />
                    </>
                  )}
                  {detail.jenis === "AKHIR" && (
                    <>
                      <Info label="Tanggal Selesai" value={detail.tanggalSelesai || "-"} />
                      <Info label="Nama Aset" value={detail.namaAset || "-"} />
                    </>
                  )}
                </div>
                {detail.pekerjaan && (
                  <div className="p-4 rounded-xl bg-muted/50">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Detail Pekerjaan
                    </div>
                    <div className="text-sm">{detail.pekerjaan}</div>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  {EDITABLE_STATUSES.has(detail.status) && (
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      onClick={() =>
                        navigate({
                          to: detail.jenis === "AWAL" ? "/laporan-awal" : "/laporan-akhir",
                          search: { edit: detail.id },
                        })
                      }
                    >
                      <Pencil className="size-4 mr-2" />
                      Edit Laporan
                    </Button>
                  )}
                  <Button
                    className="rounded-xl gradient-pln text-white"
                    onClick={() => handleExportZip(detail)}
                    disabled={zipLoading}
                  >
                    {zipLoading ? (
                      <Loader2 className="size-4 mr-2 animate-spin" />
                    ) : (
                      <FileArchive className="size-4 mr-2" />
                    )}
                    Download ZIP Evidence
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="timeline" className="mt-4">
                <TimelineView report={detail} />
              </TabsContent>

              <TabsContent value="attachments" className="mt-4">
                <AttachmentPreview report={detail} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
    </div>
  );
}

// Maps a ReportValidation.status (ValidationAction enum) to its timeline visuals.
// Hanya keterangan approval — bukan data kinerja.
const VALIDATION_TONE: Record<
  string,
  { title: string; icon: typeof CheckCircle2; tone: "completed" | "rejected" | "revised" }
> = {
  APPROVED: { title: "Disetujui", icon: CheckCircle2, tone: "completed" },
  REJECTED: { title: "Ditolak", icon: XCircle, tone: "rejected" },
  REVISION_REQUESTED: { title: "Diminta Revisi", icon: RotateCcw, tone: "revised" },
};

type TimelineEvent = {
  time: string;
  title: string;
  by?: string;
  notes?: string;
  icon: typeof CheckCircle2;
  status: "completed" | "rejected" | "revised" | "current";
};

function TimelineView({ report }: { report: HistoryItem }) {
  const validations = report.validations ?? [];

  // Selalu mulai dari event "laporan dibuat" (data nyata), lalu setiap keputusan
  // approval yang benar-benar tercatat di ReportValidation (status, validator, catatan).
  const events: TimelineEvent[] = [
    {
      time: new Date(report.createdAt).toLocaleString("id-ID"),
      title: "Laporan Dibuat",
      by: report.createdBy?.name || "-",
      icon: FileText,
      status: "completed",
    },
    ...validations.map((v): TimelineEvent => {
      const tone = VALIDATION_TONE[v.status] ?? {
        title: v.status,
        icon: CheckCircle2,
        tone: "completed" as const,
      };
      return {
        time: v.validatedAt ? new Date(v.validatedAt).toLocaleString("id-ID") : "—",
        title: tone.title,
        by: v.validator?.name,
        notes: v.notes,
        icon: tone.icon,
        status: tone.tone,
      };
    }),
  ];

  // Belum ada keputusan approval sama sekali → tampilkan marker menunggu.
  if (validations.length === 0) {
    events.push({
      time: "—",
      title: report.status === "PENDING" ? "Menunggu Validasi" : "Belum Divalidasi",
      notes: "Belum ada keputusan approval dari admin.",
      icon: Clock,
      status: "current",
    });
  }

  return (
    <div className="space-y-0">
      {events.map((event, idx) => (
        <div key={idx} className="flex gap-4 pb-6 last:pb-0">
          <div className="flex flex-col items-center">
            <div
              className={`size-8 rounded-full flex items-center justify-center ${
                event.status === "completed"
                  ? "bg-success/15 text-success"
                  : event.status === "rejected"
                    ? "bg-destructive/15 text-destructive"
                    : event.status === "revised"
                      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                      : "bg-primary/15 text-primary ring-2 ring-primary"
              }`}
            >
              <event.icon className="size-4" />
            </div>
            {idx < events.length - 1 && <div className="w-px flex-1 bg-border mt-2" />}
          </div>
          <div className="flex-1 pb-2">
            <div className="text-xs text-muted-foreground">{event.time}</div>
            <div className="font-medium text-sm">{event.title}</div>
            {event.by && (
              <div className="text-xs text-muted-foreground mt-0.5">oleh {event.by}</div>
            )}
            {event.notes && (
              <div className="mt-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground/80">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">
                  Keterangan
                </span>
                {event.notes}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AttachmentPreview({ report }: { report: HistoryItem }) {
  const jenisPath = JENIS_PATH[report.jenis];

  const {
    data: attachments,
    isLoading,
    isError,
  } = useQuery<Attachment[]>({
    queryKey: ["attachments", jenisPath, report.id],
    queryFn: () => getAttachmentsByLaporan(jenisPath, report.id),
    enabled: !!jenisPath,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" /> Memuat lampiran…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        Gagal memuat lampiran. Silakan coba lagi.
      </div>
    );
  }

  const list = attachments ?? [];

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
          <ImageIcon className="size-6 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium">Belum ada lampiran</div>
        <div className="text-xs text-muted-foreground mt-1">
          Laporan ini tidak memiliki dokumentasi terunggah.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {list.map((att) => (
          <AttachmentTile key={att.id} att={att} />
        ))}
      </div>
      <div className="text-xs text-muted-foreground">Total {list.length} file lampiran.</div>
    </div>
  );
}

function AttachmentTile({ att }: { att: Attachment }) {
  const isImage = att.mimeType?.startsWith("image/");
  const [thumb, setThumb] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Ambil thumbnail gambar via API ber-auth lalu jadikan object URL (revoke saat unmount).
  useEffect(() => {
    if (!isImage) return;
    let url: string | null = null;
    let active = true;
    fetchAttachmentBlob(att.id, false)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setThumb(url);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [att.id, isImage]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await fetchAttachmentBlob(att.id, true);
      downloadBlob(blob, att.originalName);
    } catch {
      showError("Gagal mengunduh lampiran");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      title={`Unduh ${att.originalName}`}
      className="relative rounded-xl border border-border bg-card p-3 text-left group cursor-pointer hover:border-primary/40 transition disabled:opacity-60"
    >
      <div className="aspect-square rounded-lg bg-muted/60 flex items-center justify-center overflow-hidden mb-2">
        {downloading ? (
          <Loader2 className="size-8 text-muted-foreground animate-spin" />
        ) : isImage && thumb ? (
          <img src={thumb} alt={att.originalName} className="size-full object-cover" />
        ) : isImage ? (
          <ImageIcon className="size-8 text-muted-foreground" />
        ) : (
          <FileText className="size-8 text-muted-foreground" />
        )}
      </div>
      <div className="text-xs font-medium truncate">{att.originalName}</div>
      <div className="text-[10px] text-muted-foreground">{formatBytes(att.size)}</div>
    </button>
  );
}
