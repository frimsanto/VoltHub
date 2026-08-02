import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { requireV2Role, FIELD_ONLY_ROLES } from "@/lib/v2/route-guards";
import { PageHeader, StatusBadge } from "@/components/common";
import { Timeline, type TimelineEvent } from "@/components/Timeline";
import { ImagePreviewModal } from "@/components/ImagePreviewModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportExportMenu } from "@/features/v2/reports/ReportExportMenu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { getById, validate, type LaporanAwal } from "@/lib/api/laporanAwal";
import { LaporanAwalDetailView } from "@/features/report";
import { useAuthStore } from "@/stores/auth";
import {
  ArrowLeft,
  Download,
  Share2,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  FileText,
  Image as ImageIcon,
  File,
  Clock,
  User,
  Calendar,
  MapPin,
  Shield,
  Users,
  AlertTriangle,
} from "lucide-react";
import Swal from "sweetalert2";
import { showSuccess, showSuccessAuto, showError, showConfirm } from "@/lib/swal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/laporan-awal/$id")({
  beforeLoad: () => requireV2Role(FIELD_ONLY_ROLES),
  component: LaporanAwalDetail,
  head: () => ({ meta: [{ title: "Detail Laporan Awal — VoltHub" }] }),
});

function LaporanAwalDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [laporan, setLaporan] = useState<LaporanAwal | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    name: string;
    downloadUrl?: string;
  } | null>(null);
  const [validateDialogOpen, setValidateDialogOpen] = useState(false);
  const [validateNotes, setValidateNotes] = useState("");
  const [validateAction, setValidateAction] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [validating, setValidating] = useState(false);

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const isOwner = laporan?.createdById === user?.id;

  useEffect(() => {
    loadLaporan();
  }, [id]);

  const loadLaporan = async () => {
    try {
      setLoading(true);
      const data = await getById(id);
      setLaporan(data);
    } catch (error) {
      console.error("Error loading laporan:", error);
      showError("Gagal memuat laporan");
      navigate({ to: "/laporan-awal" });
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!laporan) return;

    try {
      setValidating(true);
      await validate(laporan.id, {
        status: validateAction === "APPROVE" ? "APPROVED" : "REJECTED",
        notes: validateNotes || undefined,
      });

      await showSuccess(
        `Laporan berhasil ${validateAction === "APPROVE" ? "disetujui" : "ditolak"}`,
      );
      setValidateDialogOpen(false);
      setValidateNotes("");
      loadLaporan();
    } catch (error) {
      console.error("Error validating laporan:", error);
      showError("Gagal memvalidasi laporan");
    } finally {
      setValidating(false);
    }
  };

  const handleDelete = async () => {
    if (!laporan) return;

    const confirmed = await showConfirm(
      "Hapus Laporan",
      "Apakah Anda yakin ingin menghapus laporan ini? Tindakan ini tidak dapat dibatalkan.",
    );

    if (confirmed) {
      try {
        // Import remove function
        const { remove } = await import("@/lib/api/laporanAwal");
        await remove(laporan.id);
        await showSuccessAuto("Laporan berhasil dihapus", undefined, 1400);
        navigate({ to: "/laporan-awal" });
      } catch (error) {
        console.error("Error deleting laporan:", error);
        showError("Gagal menghapus laporan");
      }
    }
  };

  const handlePreview = (attachment: any) => {
    if (attachment.mimeType?.startsWith("image/")) {
      setPreviewImage({
        url: attachment.previewUrl || attachment.path,
        name: attachment.originalName,
        downloadUrl: attachment.downloadUrl || attachment.path,
      });
      setPreviewOpen(true);
    } else {
      window.open(attachment.downloadUrl || attachment.path, "_blank");
    }
  };

  const buildTimeline = (): TimelineEvent[] => {
    if (!laporan) return [];

    const events: TimelineEvent[] = [];

    // Created
    events.push({
      id: "created",
      type: "created",
      timestamp: new Date(laporan.createdAt),
      user: laporan.createdBy,
      details: "Laporan dibuat",
    });

    // Submitted
    if (laporan.submittedAt) {
      events.push({
        id: "submitted",
        type: "submitted",
        timestamp: new Date(laporan.submittedAt),
        user: laporan.createdBy,
        details: "Laporan disubmit untuk validasi",
      });
    }

    // Validations
    if (laporan.validations && laporan.validations.length > 0) {
      laporan.validations.forEach((validation, index) => {
        events.push({
          id: `validation-${index}`,
          type: validation.status.toLowerCase() as any,
          timestamp: new Date(validation.validatedAt),
          user: validation.validator,
          details: validation.notes ? `Catatan: ${validation.notes}` : undefined,
        });
      });
    }

    // Updated
    if (laporan.updatedAt !== laporan.createdAt) {
      events.push({
        id: "updated",
        type: "updated",
        timestamp: new Date(laporan.updatedAt),
        user: laporan.createdBy,
        details: "Laporan diperbarui",
      });
    }

    // Sort by timestamp descending
    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Memuat laporan...</p>
        </div>
      </div>
    );
  }

  if (!laporan) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <FileText className="size-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Laporan tidak ditemukan</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate({ to: "/laporan-awal" })}
          >
            Kembali
          </Button>
        </div>
      </div>
    );
  }

  const timeline = buildTimeline();

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={`Laporan Awal - ${laporan.reportId}`}
        description="Detail laporan awal pekerjaan"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/laporan-awal" })}>
              <ArrowLeft className="size-4 mr-2" />
              Kembali
            </Button>
            <ReportExportMenu sourceType="LAPORAN_AWAL" sourceId={id} variant="outline" size="sm" />
            {isAdmin && (laporan.status === "PENDING" || laporan.status === "DRAFT") && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-green-600 border-green-600 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-950/30"
                  onClick={() => {
                    setValidateAction("APPROVE");
                    setValidateDialogOpen(true);
                  }}
                >
                  <CheckCircle className="size-4 mr-2" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-600 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-950/30"
                  onClick={() => {
                    setValidateAction("REJECT");
                    setValidateDialogOpen(true);
                  }}
                >
                  <XCircle className="size-4 mr-2" />
                  Reject
                </Button>
              </>
            )}
            {(isOwner || isAdmin) && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive hover:bg-destructive/10"
                onClick={handleDelete}
              >
                <Trash2 className="size-4 mr-2" />
                Hapus
              </Button>
            )}
          </div>
        }
      />

      {/* Status Badge */}
      <div className="flex items-center gap-4">
        <StatusBadge status={laporan.status} />
        {laporan.validatedAt && (
          <span className="text-sm text-muted-foreground">
            Divalidasi pada{" "}
            {new Date(laporan.validatedAt).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Report Details */}
        <div className="lg:col-span-2">
          <LaporanAwalDetailView laporan={laporan} onPreviewAttachment={handlePreview} />
        </div>

        {/* Right Column - Timeline & Info */}
        <div className="space-y-6">
          {/* Timeline */}
          <Timeline events={timeline} />

          {/* Info Pembuat */}
          <Card className="rounded-2xl shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="size-4" />
                Informasi Pembuat
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="size-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{laporan.createdBy?.name || "-"}</p>
                  <p className="text-xs text-muted-foreground">{laporan.createdBy?.email || "-"}</p>
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Dibuat:</span>
                  <span className="font-medium">
                    {new Date(laporan.createdAt).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                {laporan.updatedAt !== laporan.createdAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Diperbarui:</span>
                    <span className="font-medium">
                      {new Date(laporan.updatedAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        imageUrl={previewImage?.url || ""}
        fileName={previewImage?.name}
        downloadUrl={previewImage?.downloadUrl}
      />

      {/* Validate Dialog */}
      <Dialog open={validateDialogOpen} onOpenChange={setValidateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {validateAction === "APPROVE" ? "Setujui Laporan" : "Tolak Laporan"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {validateAction === "APPROVE"
                ? "Apakah Anda yakin ingin menyetujui laporan ini?"
                : "Apakah Anda yakin ingin menolak laporan ini?"}
            </p>
            <Textarea
              placeholder="Tambahkan catatan (opsional)"
              value={validateNotes}
              onChange={(e) => setValidateNotes(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidateDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleValidate}
              disabled={validating}
              className={cn(
                validateAction === "APPROVE"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700",
              )}
            >
              {validating ? "Memproses..." : validateAction === "APPROVE" ? "Setujui" : "Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
