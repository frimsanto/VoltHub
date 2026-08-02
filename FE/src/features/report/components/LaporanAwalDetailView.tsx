import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Download,
  FileText,
  Image as ImageIcon,
  File,
  User,
  Shield,
  Users,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthImage } from "@/components/AuthImage";
import type { LaporanAwal, Attachment } from "@/lib/api/laporanAwal";

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-";

/**
 * Read-only presentation of a full Laporan Awal — semua menu/field laporan awal.
 * Dipakai di halaman detail (_app.laporan-awal.$id) dan dialog Validasi/Approval
 * agar reviewer bisa mengoreksi seluruh isi sebelum approve/reject.
 */
export function LaporanAwalDetailView({
  laporan,
  onPreviewAttachment,
}: {
  laporan: LaporanAwal;
  onPreviewAttachment?: (attachment: Attachment) => void;
}) {
  const getAttachmentIcon = (mimeType: string) => {
    if (mimeType?.startsWith("image/")) return <ImageIcon className="size-4" />;
    if (mimeType?.includes("pdf")) return <FileText className="size-4" />;
    return <File className="size-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Informasi Pekerjaan */}
      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="size-4" />
            Informasi Pekerjaan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ID Laporan</label>
              <p className="font-medium">{laporan.reportId}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nomor SPJ</label>
              <p className="font-medium">{laporan.nomorSPJ}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Hari</label>
              <p className="font-medium">{laporan.hari}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tanggal</label>
              <p className="font-medium">{fmtDate(laporan.tanggal)}</p>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">UP3</label>
              <p className="font-medium">{laporan.up3}</p>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Pekerjaan</label>
              <p className="font-medium">{laporan.pekerjaan}</p>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Lokasi Gardu</label>
              <p className="font-medium">{laporan.lokasiGardu}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tim Pelaksana */}
      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="size-4" />
            Tim Pelaksana
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">RTUPP</label>
              <p className="font-medium">
                {laporan.createdBy?.rtupp?.name ??
                  (laporan.createdBy ? "Belum terhubung ke RTUPP" : "-")}
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Team</label>
              <p className="font-medium">
                {laporan.createdBy?.team?.name ??
                  (laporan.createdBy ? "Belum ditugaskan ke Team" : "-")}
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Jumlah Personil</label>
              <p className="font-medium">{laporan.jumlahPersonil} orang</p>
            </div>
          </div>

          {laporan.personilSnapshot && laporan.personilSnapshot.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Daftar Personil</label>
              <div className="space-y-2">
                {laporan.personilSnapshot.map((personil, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                    <User className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{personil.nama}</p>
                      {personil.jabatan && (
                        <p className="text-xs text-muted-foreground">{personil.jabatan}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pengawas */}
      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="size-4" />
            Pengawas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pengawas Pekerjaan</label>
              <p className="font-medium">{laporan.pengawasPekerjaan || "-"}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pengawas Manuver</label>
              <p className="font-medium">{laporan.pengawasManuver || "-"}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pengawas K3</label>
              <p className="font-medium">{laporan.pengawasK3 || "-"}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nomor WP</label>
              <p className="font-medium">{laporan.nomorWP || "-"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Keselamatan Kerja */}
      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="size-4" />
            Keselamatan Kerja
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Shield
                className={cn("size-4", laporan.wpJsahirarcSop ? "text-green-500" : "text-red-500")}
              />
              <span className="text-sm">WP JSAHIRARC SOP</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield
                className={cn(
                  "size-4",
                  laporan.potensiBahayaDijelaskan ? "text-green-500" : "text-red-500",
                )}
              />
              <span className="text-sm">Potensi Bahaya Dijelaskan</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield
                className={cn("size-4", laporan.apdLengkap ? "text-green-500" : "text-red-500")}
              />
              <span className="text-sm">APD Lengkap</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield
                className={cn(
                  "size-4",
                  laporan.asuransiKetenagakerjaan ? "text-green-500" : "text-red-500",
                )}
              />
              <span className="text-sm">Asuransi Ketenagakerjaan</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield
                className={cn(
                  "size-4",
                  laporan.berdoaSebelumBekerja ? "text-green-500" : "text-red-500",
                )}
              />
              <span className="text-sm">Berdoa Sebelum Bekerja</span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Kondisi Personil</label>
              <Badge variant={laporan.kondisiPersonil === "SEHAT" ? "default" : "destructive"}>
                {laporan.kondisiPersonil}
              </Badge>
            </div>
          </div>

          {laporan.potensiBahaya && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Potensi Bahaya</label>
              <p className="text-sm">{laporan.potensiBahaya}</p>
            </div>
          )}

          {laporan.pengendalianRisiko && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pengendalian Risiko</label>
              <p className="text-sm">{laporan.pengendalianRisiko}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lampiran */}
      {laporan.attachments && laporan.attachments.length > 0 && (
        <Card className="rounded-2xl shadow-soft border-border/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4" />
              Lampiran ({laporan.attachments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {laporan.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="group relative border rounded-lg overflow-hidden cursor-pointer hover:border-primary transition-colors"
                  onClick={() => onPreviewAttachment?.(attachment)}
                >
                  {attachment.mimeType?.startsWith("image/") ? (
                    <AuthImage
                      attachmentId={attachment.id}
                      alt={attachment.originalName}
                      className="w-full h-32 object-cover"
                    />
                  ) : (
                    <div className="w-full h-32 flex items-center justify-center bg-muted">
                      {getAttachmentIcon(attachment.mimeType)}
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-xs font-medium truncate">{attachment.originalName}</p>
                    <p className="text-xs text-muted-foreground">
                      {(attachment.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  {onPreviewAttachment && (
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button size="sm" variant="secondary" className="gap-1">
                        <Download className="size-4" />
                        Preview
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
