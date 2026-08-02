import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Eye } from "lucide-react";
import { useState } from "react";
import { showSuccessAuto, showError } from "@/lib/swal";
import { requireV2Role, APPROVAL_VIEW_ROLES } from "@/lib/v2/route-guards";
import { useCan } from "@/lib/v2/rbac";
import { type HistoryItem } from "@/lib/api/history";
import {
  ReportLoading,
  ReportEmptyState,
  ReportJenisBadge,
  ReportStatusBadge,
  LaporanAwalDetailView,
  LaporanAkhirDetailView,
  getReportTitle,
  getReportLocation,
  useReports,
} from "@/features/report";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  validate as validateAwal,
  getById as getAwalById,
  type LaporanAwal,
} from "@/lib/api/laporanAwal";
import {
  validate as validateAkhir,
  getById as getAkhirById,
  type LaporanAkhir,
} from "@/lib/api/laporanAkhir";

type ValidasiTab = "pending" | "approved" | "rejected";
type ValidasiSearch = { tab?: ValidasiTab };

export const Route = createFileRoute("/_app/validasi")({
  // Approval is a write action → ADMIN acts. MASTER may open the page as a
  // read-only audit view; the approve/reject buttons are capability-gated below.
  beforeLoad: () => requireV2Role(APPROVAL_VIEW_ROLES),
  // Sinkron tab aktif ke URL (?tab=...). Default "pending" diomit agar URL bersih.
  validateSearch: (s: Record<string, unknown>): ValidasiSearch => {
    return s.tab === "approved" || s.tab === "rejected" ? { tab: s.tab } : {};
  },
  component: Validasi,
  head: () => ({ meta: [{ title: "Validasi Laporan — VoltHub" }] }),
});

function Validasi() {
  const [active, setActive] = useState<HistoryItem | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const queryClient = useQueryClient();
  // MASTER membuka halaman ini read-only (audit) — tanpa tombol approve/reject.
  const canApprove = useCan("laporan.approve");

  const sp = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: ValidasiTab = sp.tab ?? "pending";
  const setTab = (v: string) =>
    navigate({
      search: (prev) => ({ ...prev, tab: v === "pending" ? undefined : (v as ValidasiTab) }),
      replace: true,
    });

  // Fetch pending reports
  const { data: pendingData, isLoading: pendingLoading } = useReports({
    status: "PENDING",
    page: 1,
    limit: 50,
  });

  // Fetch approved reports
  const { data: approvedData, isLoading: approvedLoading } = useReports({
    status: "APPROVED",
    page: 1,
    limit: 50,
  });

  // Fetch rejected reports
  const { data: rejectedData, isLoading: rejectedLoading } = useReports({
    status: "REJECTED",
    page: 1,
    limit: 50,
  });

  const pending = pendingData?.items || [];
  const approved = approvedData?.items || [];
  const rejected = rejectedData?.items || [];

  // Detail penuh laporan yang sedang ditinjau — diambil saat dialog Detail dibuka
  // agar reviewer melihat SEMUA field laporan awal/akhir (bukan ringkasan saja).
  const { data: detail, isLoading: detailLoading } = useQuery<LaporanAwal | LaporanAkhir>({
    queryKey: ["report-detail", active?.jenis, active?.id],
    enabled: !!active && !rejectOpen,
    queryFn: () =>
      active?.jenis === "AKHIR" ? getAkhirById(active.id) : getAwalById(active!.id),
  });

  const handleApprove = async (item: HistoryItem) => {
    try {
      if (item.jenis === "AWAL") {
        await validateAwal(item.id, { status: "APPROVED", notes: "Laporan disetujui" });
      } else if (item.jenis === "AKHIR") {
        await validateAkhir(item.id, { status: "APPROVED", notes: "Laporan disetujui" });
      }
      showSuccessAuto("Laporan disetujui", item.reportId, 1200);
      // Invalidate queries to refresh data (semua daftar laporan kini di bawah key ['reports'])
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (error) {
      showError("Gagal menyetujui laporan");
    }
  };

  const handleReject = async (item: HistoryItem, notes: string) => {
    try {
      if (item.jenis === "AWAL") {
        await validateAwal(item.id, { status: "REJECTED", notes: notes || "Laporan ditolak" });
      } else if (item.jenis === "AKHIR") {
        await validateAkhir(item.id, { status: "REJECTED", notes: notes || "Laporan ditolak" });
      }
      showSuccessAuto("Laporan ditolak", item.reportId, 1200);
      // Invalidate queries to refresh data (semua daftar laporan kini di bawah key ['reports'])
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (error) {
      showError("Gagal menolak laporan");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Validasi Laporan"
        description="Tinjau dan verifikasi laporan yang masuk."
        actions={
          <Badge variant="secondary" className="rounded-full px-3">
            {pending.length} menunggu
          </Badge>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejected.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4">
          {pendingLoading ? (
            <ReportLoading />
          ) : pending.length === 0 ? (
            <ReportEmptyState
              title="Tidak ada laporan menunggu validasi"
              description="Semua laporan telah diproses"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pending.map((r) => (
                <Card
                  key={r.id}
                  className="rounded-2xl shadow-soft border-border/60 hover:shadow-md transition"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <ReportJenisBadge jenis={r.jenis} />
                      <ReportStatusBadge status={r.status} />
                    </div>
                    <div className="font-semibold text-sm leading-snug">{getReportTitle(r)}</div>
                    <div className="text-xs text-muted-foreground mt-2">{getReportLocation(r)}</div>
                    <div className="text-xs mt-3 flex items-center justify-between">
                      <span className="font-mono">{r.reportId}</span>
                      <span className="text-muted-foreground">{r.createdBy?.name || "-"}</span>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 rounded-lg"
                        data-testid="report-detail"
                        onClick={() => setActive(r)}
                      >
                        <Eye className="size-4 mr-1.5" /> Detail
                      </Button>
                      {canApprove && (
                        <>
                          <Button
                            size="sm"
                            className="rounded-lg bg-success text-success-foreground hover:bg-success/90"
                            data-testid="approve-report"
                            aria-label="Setujui laporan"
                            onClick={() => handleApprove(r)}
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="rounded-lg"
                            data-testid="reject-report"
                            aria-label="Tolak laporan"
                            onClick={() => {
                              setActive(r);
                              setRejectOpen(true);
                            }}
                          >
                            <X className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="approved" className="mt-4">
          {approvedLoading ? (
            <ReportLoading />
          ) : approved.length === 0 ? (
            <ReportEmptyState
              title="Tidak ada laporan disetujui"
              description="Laporan yang disetujui akan muncul di sini"
            />
          ) : (
            <ListSimple items={approved} />
          )}
        </TabsContent>
        <TabsContent value="rejected" className="mt-4">
          {rejectedLoading ? (
            <ReportLoading />
          ) : rejected.length === 0 ? (
            <ReportEmptyState
              title="Tidak ada laporan ditolak"
              description="Laporan yang ditolak akan muncul di sini"
            />
          ) : (
            <ListSimple items={rejected} />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!active && !rejectOpen} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>Detail {active?.reportId}</span>
              {active && <ReportJenisBadge jenis={active.jenis} />}
              {active && <ReportStatusBadge status={active.status} />}
            </DialogTitle>
          </DialogHeader>

          {detailLoading || !detail ? (
            <ReportLoading />
          ) : active?.jenis === "AKHIR" ? (
            <LaporanAkhirDetailView laporan={detail as LaporanAkhir} />
          ) : (
            <LaporanAwalDetailView laporan={detail as LaporanAwal} />
          )}

          {/* Aksi validasi langsung dari detail — koreksi dulu, lalu setujui/tolak */}
          {canApprove && active?.status === "PENDING" && (
            <DialogFooter className="sticky bottom-0 bg-background pt-3 border-t gap-2">
              <Button
                variant="destructive"
                className="rounded-lg"
                onClick={() => setRejectOpen(true)}
              >
                <X className="size-4 mr-1.5" /> Tolak
              </Button>
              <Button
                className="rounded-lg bg-success text-success-foreground hover:bg-success/90"
                data-testid="confirm-approve"
                onClick={() => {
                  if (active) handleApprove(active);
                  setActive(null);
                }}
              >
                <Check className="size-4 mr-1.5" /> Setujui
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak Laporan {active?.reportId}</DialogTitle>
          </DialogHeader>
          <Textarea
            id="reject-notes"
            data-testid="reject-notes"
            placeholder="Alasan penolakan..."
            rows={4}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setRejectOpen(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              data-testid="reject-confirm"
              onClick={() => {
                const notes =
                  (document.getElementById("reject-notes") as HTMLTextAreaElement)?.value || "";
                if (active) handleReject(active, notes);
                setRejectOpen(false);
                setActive(null);
              }}
            >
              Tolak
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ListSimple({ items }: { items: HistoryItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((r) => (
        <Card key={r.id} className="rounded-2xl shadow-soft border-border/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs">{r.reportId}</span>
              <ReportStatusBadge status={r.status} />
            </div>
            <div className="text-sm font-semibold">{getReportTitle(r)}</div>
            <div className="text-xs text-muted-foreground mt-2">
              {getReportLocation(r)} • {r.createdBy?.name || "-"}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
