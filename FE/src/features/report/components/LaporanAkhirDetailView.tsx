import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Download,
  FileText,
  Image as ImageIcon,
  File,
  User,
  Server,
  Network,
  Shield,
  Wrench,
  CheckSquare,
} from "lucide-react";
import { AuthImage } from "@/components/AuthImage";
import type { LaporanAkhir } from "@/lib/api/laporanAkhir";

type AkhirAttachment = NonNullable<LaporanAkhir["attachments"]>[number];

// Sebagian besar lampiran akhir adalah foto (FOTO_HASIL dll). Anggap gambar bila
// mimeType image/* atau kategori/nama file mengindikasikan foto.
function isImageAttachment(att: AkhirAttachment): boolean {
  if (att.mimeType) return att.mimeType.startsWith("image/");
  const hint = `${att.category} ${att.originalName}`.toLowerCase();
  return (
    hint.includes("image") ||
    hint.includes("foto") ||
    /\.(jpe?g|png|gif|webp|heic)$/.test(hint)
  );
}

function getDeviceStatusBadge(status: string) {
  if (status === "NORMAL") {
    return (
      <Badge variant="default" className="bg-green-500 hover:bg-green-600">
        NORMAL
      </Badge>
    );
  } else if (status === "HATI_HATI") {
    return (
      <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:text-yellow-400">
        HATI-HATI
      </Badge>
    );
  } else if (status === "RUSAK") {
    return <Badge variant="destructive">RUSAK</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

/**
 * Read-only presentation of a full Laporan Akhir — semua menu/field laporan akhir.
 * Dipakai di halaman detail (_app.laporan-akhir.$id) dan dialog Validasi/Approval
 * agar reviewer bisa mengoreksi seluruh isi sebelum approve/reject.
 */
export function LaporanAkhirDetailView({
  laporan,
  onPreviewAttachment,
}: {
  laporan: LaporanAkhir;
  onPreviewAttachment?: (attachment: AkhirAttachment) => void;
}) {
  const getAttachmentIcon = (category: string) => {
    if (category === "image") return <ImageIcon className="size-4" />;
    if (category === "document") return <FileText className="size-4" />;
    if (category === "logger") return <FileText className="size-4" />;
    return <File className="size-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Informasi Dasar */}
      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="size-4" />
            Informasi Dasar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ID Laporan</label>
              <p className="font-medium">{laporan.reportId}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tanggal Selesai</label>
              <p className="font-medium">{laporan.tanggalSelesai}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Jenis Pekerjaan</label>
              <p className="font-medium">{laporan.jenisPekerjaan}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">UP3</label>
              <p className="font-medium">{laporan.up3}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">RTUPP</label>
              <p className="font-medium">{laporan.rtupp || "-"}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Gardu</label>
              <p className="font-medium">{laporan.gardu}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Informasi Teknis */}
      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="size-4" />
            Informasi Teknis (IP Address)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ASDU</label>
              <p className="font-medium font-mono">{laporan.asdu || "-"}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">IP Modem</label>
              <p className="font-medium font-mono">{laporan.ipModem || "-"}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">IP RTU</label>
              <p className="font-medium font-mono">{laporan.ipRTU || "-"}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">IP SIM 1</label>
              <p className="font-medium font-mono">{laporan.ipSIM1 || "-"}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">IP SIM 2</label>
              <p className="font-medium font-mono">{laporan.ipSIM2 || "-"}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">IP GTW IconPlus</label>
              <p className="font-medium font-mono">{laporan.ipGTWIconPlus || "-"}</p>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">IP WAN</label>
              <p className="font-medium font-mono">{laporan.ipWAN || "-"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Aset SCADA */}
      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="size-4" />
            Aset SCADA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">RTU Nama</label>
              <p className="font-medium">{laporan.rtuNama}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">RTU Model</label>
              <p className="font-medium">{laporan.rtuType || "-"}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Media Nama</label>
              <p className="font-medium">{laporan.mediaNama}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Media Model</label>
              <p className="font-medium">{laporan.mediaType || "-"}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Rectifier Nama</label>
              <p className="font-medium">{laporan.rectifierNama}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Rectifier Model</label>
              <p className="font-medium">{laporan.rectifierType || "-"}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Baterai Nama</label>
              <p className="font-medium">{laporan.bateraiNama}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Baterai Model</label>
              <p className="font-medium">{laporan.bateraiType || "-"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Pekerjaan */}
      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="size-4" />
            Detail Pekerjaan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Langkah Pekerjaan</label>
            <p className="text-sm whitespace-pre-wrap">{laporan.langkahPekerjaan}</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Hasil Pekerjaan</label>
            <p className="text-sm whitespace-pre-wrap">{laporan.hasilPekerjaan}</p>
          </div>
        </CardContent>
      </Card>

      {/* Catatan Perangkat */}
      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckSquare className="size-4" />
            Catatan Perangkat
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">RTU</span>
              {getDeviceStatusBadge(laporan.catatanRTU)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Media</span>
              {getDeviceStatusBadge(laporan.catatanMedia)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Rectifier</span>
              {getDeviceStatusBadge(laporan.catatanRectifier)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Baterai</span>
              {getDeviceStatusBadge(laporan.catatanBaterai)}
            </div>
          </div>
          {laporan.catatanLain && (
            <div className="pt-2 border-t">
              <label className="text-xs text-muted-foreground mb-1 block">Catatan Lain</label>
              <p className="text-sm">{laporan.catatanLain}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Pekerjaan */}
      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="size-4" />
            Status Pekerjaan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status Sebelum</label>
              <Badge variant="outline">{laporan.statusSebelum}</Badge>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status Sesudah</label>
              <Badge variant="outline">{laporan.statusSesudah}</Badge>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Status Pekerjaan</label>
              <Badge variant={laporan.statusPekerjaan === "SELESAI" ? "default" : "secondary"}>
                {laporan.statusPekerjaan}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Penutup */}
      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="size-4" />
            Penutup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pengawas</label>
              <p className="font-medium">{laporan.pengawas}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pelaksana</label>
              <p className="font-medium">{laporan.pelaksana}</p>
            </div>
          </div>
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
                  {isImageAttachment(attachment) ? (
                    <AuthImage
                      attachmentId={attachment.id}
                      alt={attachment.originalName}
                      className="w-full h-32 object-cover"
                    />
                  ) : (
                    <div className="w-full h-32 flex items-center justify-center bg-muted">
                      {getAttachmentIcon(attachment.category)}
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-xs font-medium truncate">{attachment.originalName}</p>
                    <p className="text-xs text-muted-foreground">{attachment.category}</p>
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
