import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Send, CheckCircle2, XCircle, Pencil } from "lucide-react";
import { requireAuth } from "@/lib/route-guards";
import { useV2Role } from "@/lib/v2/rbac";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/v2/PageHeader";
import { GiStatusBadge } from "@/components/v2/GiStatusBadge";
import { v2Put } from "@/lib/api/v2";
import {
  harGh,
  useSubmitHarGh,
  useValidateHarGh,
  type CreateHarGh,
  type HarGhDetail,
} from "@/features/v2/har-gh/resource";
import { HarGhForm, type SubmitIntent } from "@/features/v2/har-gh/HarGhForm";
import { GhAttachments } from "@/features/v2/gh-shared/GhAttachments";
import { GhReportDetail } from "@/features/v2/gh-shared/GhReportDetail";

export const Route = createFileRoute("/_app/har-gh/$id")({
  beforeLoad: () => requireAuth(),
  component: HarGhDetailPage,
});

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

function HarGhDetailPage() {
  const { id } = Route.useParams();
  const role = useV2Role();
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = harGh.useOne(id);
  const submitM = useSubmitHarGh();
  const validateM = useValidateHarGh();
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const linkedWo = data?.workOrderId ?? null;
  // Validasi = write — ADMIN only (MASTER hanya audit read, tanpa tombol aksi).
  const canValidate = role === "ADMIN" && data?.status === "SUBMITTED" && !linkedWo;
  const isOwner = !!data?.inspector?.id && data.inspector.id === user?.id;
  const editable = (data?.status === "DRAFT" || data?.status === "REJECTED") && (isOwner || role === "PETUGAS");
  const canSubmit = (data?.status === "DRAFT" || data?.status === "REJECTED") && !linkedWo;

  if (isLoading || !data) {
    return (
      <div>
        <PageHeader title="Detail Laporan HAR GH" actions={<BackBtn />} />
        <p className="text-sm text-muted-foreground">Memuat…</p>
      </div>
    );
  }

  if (editing) {
    return (
      <div>
        <PageHeader
          title={`Revisi HAR GH · ${data.location?.name ?? "—"}`}
          description="Perbaiki laporan lalu simpan / kirim ulang."
          actions={<Button variant="outline" onClick={() => setEditing(false)}><ArrowLeft className="size-4" /> Batal</Button>}
        />
        <HarGhForm
          initial={data}
          submitting={saving}
          onCancel={() => setEditing(false)}
          onSubmit={async (values: CreateHarGh, intent: SubmitIntent) => {
            setSaving(true);
            try {
              await v2Put<HarGhDetail, CreateHarGh>(`/gh/har/${id}`, values);
              if (intent === "SUBMITTED") await submitM.mutateAsync(id);
              setEditing(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
            } finally {
              setSaving(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Laporan HAR GH · ${data.location?.name ?? "—"}`}
        description={`WO ${data.workOrder?.woNumber ?? "—"} · ${fmtDate(data.reportDate)}`}
        actions={
          <div className="flex gap-2">
            {editable && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> {data.status === "REJECTED" ? "Revisi" : "Edit"}
              </Button>
            )}
            <BackBtn />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <GiStatusBadge status={data.status} />
        {data.up3 && <Badge variant="outline">UP3: {data.up3}</Badge>}
        {data.pelaksana && <Badge variant="outline">Pelaksana: {data.pelaksana}</Badge>}
        {data.inspector?.name && <Badge variant="outline">Petugas: {data.inspector.name}</Badge>}
        {data.statusRc && <Badge variant="outline">Status RC: {data.statusRc}</Badge>}
      </div>

      {linkedWo && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 pt-6 text-sm">
            <span className="text-muted-foreground">
              Laporan ini tertaut Work Order — pengiriman &amp; approval dilakukan di Work Order.
            </span>
            <Link className="text-primary hover:underline" to="/work-order/$id" params={{ id: linkedWo }}>
              Buka Work Order →
            </Link>
          </CardContent>
        </Card>
      )}

      {(data.statusGarduSebelum || data.statusGarduSesudah || data.statusPekerjaan) && (
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 pt-6 md:grid-cols-3">
            <Row label="Status Gardu Sebelum" value={data.statusGarduSebelum} />
            <Row label="Status Gardu Sesudah" value={data.statusGarduSesudah} />
            <Row label="Status Pekerjaan" value={data.statusPekerjaan} />
          </CardContent>
        </Card>
      )}

      <GhReportDetail variant="HAR" data={data as unknown as Record<string, unknown>} />

      {(data.notes || data.catatan) && (
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 pt-6 md:grid-cols-2">
            <Row label="Catatan" value={data.catatan} />
            <Row label="Lain-lain" value={data.notes} />
          </CardContent>
        </Card>
      )}

      {data.status === "REJECTED" && data.validationNote && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <Row label="Catatan Penolakan (perbaiki lalu kirim ulang)" value={data.validationNote} />
          </CardContent>
        </Card>
      )}
      {data.status !== "REJECTED" && data.validationNote && (
        <Card>
          <CardContent className="pt-6">
            <Row label="Catatan Validasi" value={data.validationNote} />
          </CardContent>
        </Card>
      )}

      <GhAttachments basePath="/v1/gh/har" parentId={id} readOnly={!editable} />

      <Card>
        <CardContent className="space-y-3 pt-6">
          {canSubmit && (
            <Button onClick={() => submitM.mutate(id)} disabled={submitM.isPending}>
              <Send className="size-4" /> Kirim untuk Validasi
            </Button>
          )}
          {canValidate && (
            <div className="space-y-2">
              <Textarea
                placeholder="Catatan validasi (opsional untuk setujui, wajib untuk tolak)…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => validateM.mutate({ id, decision: "VALIDATED", validationNote: note || null })}
                  disabled={validateM.isPending}
                >
                  <CheckCircle2 className="size-4" /> Validasi
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => validateM.mutate({ id, decision: "REJECTED", validationNote: note || null })}
                  disabled={validateM.isPending}
                >
                  <XCircle className="size-4" /> Tolak
                </Button>
              </div>
            </div>
          )}
          {!canSubmit && !canValidate && !editable && (
            <p className="text-sm text-muted-foreground">Tidak ada aksi tersedia untuk status saat ini.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BackBtn() {
  const navigate = useNavigate();
  return (
    <Button variant="outline" onClick={() => navigate({ to: "/har-gh" })}>
      <ArrowLeft className="size-4" /> Kembali
    </Button>
  );
}
