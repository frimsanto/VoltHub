import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Send, CheckCircle2, XCircle, Pencil } from "lucide-react";
import { requireAuth } from "@/lib/route-guards";
import { useV2Role } from "@/lib/v2/rbac";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/v2/PageHeader";
import { GiStatusBadge, GiComparisonBadge } from "@/components/v2/GiStatusBadge";
import {
  inspeksiGi,
  INSPEKSI_GI_SECTIONS,
  GI_STATUS_FIELDS,
  SERIAL_DEVICE_FIELDS,
  useSubmitInspeksiGi,
  useValidateInspeksiGi,
  type GiFieldDef,
  type GiSectionDef,
  type InspeksiGiDetail,
  type CreateInspeksiGi,
} from "@/features/v2/inspeksi-gi/resource";
import { InspeksiGiForm, type SubmitIntent } from "@/features/v2/inspeksi-gi/InspeksiGiForm";
import { LaporanGiAttachments } from "@/features/v2/inspeksi-gi/LaporanGiAttachments";
import { GI_KESIMPULAN_LABELS } from "@/lib/v2/enums";

export const Route = createFileRoute("/_app/inspeksi-gi/$id")({
  beforeLoad: () => requireAuth(),
  component: InspeksiGiDetailPage,
});

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

const KUBIKEL_ELEMENTS = [
  { key: "PMT", label: "PMT (OPEN/CLOSE)" },
  { key: "LR", label: "LOCAL/REMOTE (L/R)" },
  { key: "ES", label: "ES (EARTHING SWITCH)" },
  { key: "RACK", label: "RACK IN/OUT" },
  { key: "MPUF", label: "MPUF" },
  { key: "IEDCF", label: "IEDCF" },
  { key: "TCS", label: "TCS" },
  { key: "CCS", label: "CCS" },
  { key: "CBTR", label: "CBTR" },
  { key: "GFT", label: "GFT" },
  { key: "IGFT", label: "IGFT" },
  { key: "OCT", label: "OCT" },
  { key: "IOCT", label: "IOCT" },
  { key: "MSF", label: "MSF" },
  { key: "PSF", label: "PSF" },
  { key: "CSF", label: "CSF" },
  { key: "I1", label: "I1 (ARUS BEBAN)" },
  { key: "I2", label: "I2 (ARUS BEBAN)" },
  { key: "I3", label: "I3 (ARUS BEBAN)" },
  { key: "V1", label: "V1 (TEGANGAN TRAFO)" },
  { key: "V2", label: "V2 (TEGANGAN TRAFO)" },
  { key: "V3", label: "V3 (TEGANGAN TRAFO)" },
  { key: "AMF_N", label: "AMF N" },
  { key: "AMF_R", label: "AMF R" },
  { key: "AMF_S", label: "AMF S" },
  { key: "AMF_T", label: "AMF T" },
  { key: "F", label: "FREKUENSI F" },
  { key: "P", label: "ACTIVE POWER P" },
  { key: "Q", label: "REACTIVE POWER Q" },
  { key: "S", label: "APPARENT POWER S" },
] as const;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

function fieldValue(obj: Record<string, unknown> | undefined, f: GiFieldDef): React.ReactNode {
  const raw = obj?.[f.name];
  if (raw == null || raw === "") return null;
  if (f.name === "kesimpulan") return GI_KESIMPULAN_LABELS[raw as keyof typeof GI_KESIMPULAN_LABELS] ?? String(raw);
  return String(raw);
}

function FlatView({ section, data }: { section: GiSectionDef; data: Record<string, unknown> }) {
  if (data.tidakAda === true) return <p className="text-sm text-muted-foreground">Peralatan tidak ada.</p>;
  return <>{(section.fields ?? []).map((f) => <Row key={f.name} label={f.label} value={fieldValue(data, f)} />)}</>;
}

function DeviceView({ obj, fields }: { obj: unknown; fields: GiFieldDef[] }) {
  if (!isObj(obj)) return <p className="text-sm text-muted-foreground">—</p>;
  return <>{fields.map((f) => <Row key={f.name} label={f.label} value={fieldValue(obj, f)} />)}</>;
}

function SectionView({ section, data }: { section: GiSectionDef; data: InspeksiGiDetail }) {
  const val = (data[section.key as keyof InspeksiGiDetail] as Record<string, unknown>) ?? {};
  if (section.variant === "flat") return <FlatView section={section} data={val} />;
  
  if (section.variant === "serialDevice") {
    return (
      <div className="space-y-3">
        <Row label="Jumlah Serial Device" value={(val.jumlah as string) ?? null} />
        <p className="text-xs font-medium text-muted-foreground">Device Utama</p>
        <DeviceView obj={val.utama} fields={SERIAL_DEVICE_FIELDS} />
        <p className="text-xs font-medium text-muted-foreground">Device Ke-2</p>
        {val.device2TidakAda === true ? (
          <p className="text-sm text-muted-foreground">Tidak ada.</p>
        ) : (
          <DeviceView obj={val.device2} fields={SERIAL_DEVICE_FIELDS} />
        )}
      </div>
    );
  }

  if (section.variant === "kubikel") {
    const elements = (val.elements as Record<string, any>) ?? {};
    return (
      <div className="space-y-4">
        <Row label="Merek Cubicle" value={(val.merekCubicle as string) ?? null} />
        
        <div className="overflow-x-auto rounded border text-[11px]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-muted text-muted-foreground font-semibold">
              <tr>
                <th className="p-2 border-b">Elemen</th>
                <th className="p-2 border-b">Relay</th>
                <th className="p-2 border-b">Cubicle</th>
                <th className="p-2 border-b">Master</th>
                <th className="p-2 border-b">Hasil RC</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {KUBIKEL_ELEMENTS.map((el) => {
                const item = elements[el.key] ?? {};
                let relayStr = "—";
                if (el.key === "PMT") {
                  relayStr = `OPEN: ${item.relayOpen ?? "—"} / CLOSE: ${item.relayClose ?? "—"}`;
                } else if (el.key === "LR") {
                  relayStr = `LOCAL: ${item.relayLocal ?? "—"} / REMOTE: ${item.relayRemote ?? "—"}`;
                } else {
                  relayStr = item.relay ?? "—";
                }

                return (
                  <tr key={el.key} className="hover:bg-muted/10">
                    <td className="p-2 font-medium">{el.label}</td>
                    <td className="p-2 font-mono">{relayStr}</td>
                    <td className="p-2 font-mono">{item.cubicle ?? "—"}</td>
                    <td className="p-2 font-mono">{item.master ?? "—"}</td>
                    <td className="p-2 font-mono">{el.key === "PMT" ? item.hasilRc ?? "—" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Row label="Keterangan" value={(val.keterangan as string) ?? null} />
        <Row label="Kesimpulan" value={fieldValue(val, { name: "kesimpulan", label: "" })} />
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">—</p>;
}

function InspeksiGiDetailPage() {
  const { id } = Route.useParams();
  const role = useV2Role();
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = inspeksiGi.useOne(id);
  const submitM = useSubmitInspeksiGi();
  const validateM = useValidateInspeksiGi();
  const updateM = inspeksiGi.useUpdate();
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
        <PageHeader title="Detail Laporan GI" actions={<BackBtn />} />
        <p className="text-sm text-muted-foreground">Memuat…</p>
      </div>
    );
  }

  if (editing) {
    return (
      <div>
        <PageHeader
          title={`Revisi Laporan GI · ${data.location?.name ?? "—"}`}
          description="Perbaiki laporan lalu simpan / kirim ulang."
          actions={<Button variant="outline" onClick={() => setEditing(false)}><ArrowLeft className="size-4" /> Batal</Button>}
        />
        <InspeksiGiForm
          initial={data}
          submitting={saving}
          onCancel={() => setEditing(false)}
          onSubmit={async (values: CreateInspeksiGi, intent: SubmitIntent) => {
            setSaving(true);
            try {
              await updateM.mutateAsync({ id, body: values });
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
        title={`Laporan GI · ${data.location?.name ?? "—"}`}
        description={`${data.feeder?.feederName ?? "Tanpa penyulang"} · ${fmtDate(data.reportDate)}`}
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
        <GiComparisonBadge value={data.comparisonResult} />
        {data.up3 && <Badge variant="outline">UP3: {data.up3}</Badge>}
        {data.pelaksana && <Badge variant="outline">Pelaksana: {data.pelaksana}</Badge>}
        {data.inspector?.name && <Badge variant="outline">Petugas: {data.inspector.name}</Badge>}
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

      {/* Status inti + Pembanding master (kolom scalar) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status Kubikel & Pembanding Master</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {GI_STATUS_FIELDS.map((f) => (
            <Row key={f.name} label={f.label} value={(data[f.name as keyof InspeksiGiDetail] as string) ?? null} />
          ))}
          <Row label="Hasil Pembanding" value={<GiComparisonBadge value={data.comparisonResult} />} />
        </CardContent>
      </Card>

      {/* Seksi perangkat */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {INSPEKSI_GI_SECTIONS.map((s) => (
          <Card key={s.key}>
            <CardHeader>
              <CardTitle className="text-sm">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <SectionView section={s} data={data} />
            </CardContent>
          </Card>
        ))}
      </div>

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

      {/* Laporan GI Attachments (FASE C) */}
      <LaporanGiAttachments 
        laporanGiId={id} 
        readOnly={!editable} 
      />

      {/* Aksi workflow */}
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
    <Button variant="outline" onClick={() => navigate({ to: "/inspeksi-gi" })}>
      <ArrowLeft className="size-4" /> Kembali
    </Button>
  );
}
