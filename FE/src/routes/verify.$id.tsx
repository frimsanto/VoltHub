import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Loader2,
  Zap,
  FileText,
  Calendar,
  KeyRound,
  Building2,
  UserCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BRAND_NAME } from "@/lib/brand";
import { useVerifySignature, type VerifyResult, type VerifyStatus } from "@/features/v2/reports/signature";

/**
 * PUBLIC report-verification page — the target of every report's QR code.
 * Renders without authentication so anyone can confirm a document's authenticity
 * and integrity. Spec: docs/DIGITAL_SIGNATURE.md.
 */
export const Route = createFileRoute("/verify/$id")({
  component: VerifyPage,
  head: () => ({ meta: [{ title: `Verifikasi Dokumen — ${BRAND_NAME}` }] }),
});

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" }) : "—";

const STATUS_UI: Record<
  VerifyStatus,
  { label: string; tone: string; icon: typeof ShieldCheck; blurb: string }
> = {
  VALID: {
    label: "Dokumen Sah",
    tone: "text-emerald-600 dark:text-emerald-400",
    icon: ShieldCheck,
    blurb: "Tanda tangan digital valid dan isi dokumen tidak berubah.",
  },
  REVOKED: {
    label: "Dicabut",
    tone: "text-amber-600 dark:text-amber-400",
    icon: ShieldAlert,
    blurb: "Tanda tangan dokumen ini telah dicabut oleh penerbit.",
  },
  TAMPERED: {
    label: "Dokumen Berubah",
    tone: "text-red-600 dark:text-red-400",
    icon: ShieldX,
    blurb: "Berkas tersimpan tidak cocok dengan sidik yang ditandatangani.",
  },
  INVALID_SIGNATURE: {
    label: "Tanda Tangan Tidak Valid",
    tone: "text-red-600 dark:text-red-400",
    icon: ShieldX,
    blurb: "Tanda tangan kriptografis tidak dapat diverifikasi.",
  },
  NOT_FOUND: {
    label: "Tidak Ditemukan",
    tone: "text-slate-500",
    icon: ShieldX,
    blurb: "Tidak ada tanda tangan yang cocok dengan kode ini.",
  },
};

function Row({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="break-words text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

function Result({ data }: { data: VerifyResult }) {
  const ui = STATUS_UI[data.status];
  const Icon = ui.icon;
  const sig = data.signature;

  return (
    <Card className="overflow-hidden border-2 shadow-lg">
      {/* Verdict banner */}
      <div className="flex flex-col items-center gap-2 bg-muted/40 px-6 py-8 text-center">
        <Icon className={`size-16 ${ui.tone}`} strokeWidth={1.5} />
        <h1 className={`text-2xl font-bold ${ui.tone}`}>{ui.label}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{ui.blurb}</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Badge variant={data.signatureValid ? "default" : "destructive"}>
            {data.signatureValid ? "Tanda tangan valid" : "Tanda tangan invalid"}
          </Badge>
          {data.contentIntact !== null && (
            <Badge variant={data.contentIntact ? "default" : "destructive"}>
              {data.contentIntact ? "Isi utuh" : "Isi berubah"}
            </Badge>
          )}
        </div>
      </div>

      {sig && (
        <CardContent className="px-6 py-4">
          <Row icon={FileText} label="Nomor Dokumen" value={sig.reportNumber} />
          {data.report?.title && <Row icon={FileText} label="Judul" value={data.report.title} />}
          <Separator />
          <Row icon={Building2} label="Penerbit" value={sig.issuer} />
          {sig.signerName && <Row icon={UserCheck} label="Penandatangan" value={sig.signerName} />}
          <Row icon={Calendar} label="Ditandatangani" value={fmt(sig.signedAt)} />
          <Separator />
          <Row icon={KeyRound} label="Algoritma" value={`${sig.algorithm} · Key ${sig.keyId}`} />
          {sig.revokedReason && (
            <Row icon={ShieldAlert} label="Alasan Pencabutan" value={sig.revokedReason} />
          )}
        </CardContent>
      )}

      <div className="border-t bg-muted/30 px-6 py-3 text-center text-xs text-muted-foreground">
        Diverifikasi {fmt(data.verifiedAt)}
      </div>
    </Card>
  );
}

function VerifyPage() {
  const { id } = Route.useParams();
  const { data, isLoading, isError } = useVerifySignature(id);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background px-4 py-10">
      <div className="mx-auto max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-primary">
          <Zap className="size-6" />
          <span className="text-lg font-bold">{BRAND_NAME}</span>
        </Link>

        {isLoading && (
          <Card className="p-10">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
              <p className="text-sm">Memverifikasi dokumen…</p>
            </div>
          </Card>
        )}

        {isError && (
          <Card className="p-10 text-center">
            <ShieldX className="mx-auto size-12 text-red-600 dark:text-red-400" />
            <p className="mt-3 text-sm text-muted-foreground">
              Gagal memverifikasi. Periksa koneksi Anda lalu coba lagi.
            </p>
          </Card>
        )}

        {data && <Result data={data} />}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Verifikasi keaslian dokumen resmi {BRAND_NAME} melalui tanda tangan digital Ed25519.
        </p>
      </div>
    </div>
  );
}
