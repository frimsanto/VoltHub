import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireAuth } from "@/lib/route-guards";
import { useV2Role } from "@/lib/v2/rbac";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/v2/PageHeader";
import { GiStatusBadge } from "@/components/v2/GiStatusBadge";
import {
  harGi,
  useSubmitHarGi,
  HAR_FLAT_SECTIONS,
  HAR_SERIAL_FIELDS,
  HAR_CCTV_PARTS,
  type HarGiDetail,
  type CreateHarGi,
} from "@/features/v2/har-gi/resource";
import { HarGiForm, type SubmitIntent } from "@/features/v2/har-gi/HarGiForm";
import { GI_KESIMPULAN_LABELS } from "@/lib/v2/enums";
import type { GiFieldDef } from "@/features/v2/inspeksi-gi/resource";

export const Route = createFileRoute("/_app/har-gi/$id")({
  beforeLoad: () => requireAuth(),
  component: HarGiDetailPage,
});

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm whitespace-pre-line">{value ?? "—"}</span>
    </div>
  );
}

function fieldValue(obj: Record<string, unknown> | undefined, f: GiFieldDef): React.ReactNode {
  const raw = obj?.[f.name];
  if (raw == null || raw === "") return null;
  if (f.name === "kesimpulan") return GI_KESIMPULAN_LABELS[raw as keyof typeof GI_KESIMPULAN_LABELS] ?? String(raw);
  return String(raw);
}

function DeviceView({ obj, fields }: { obj: unknown; fields: GiFieldDef[] }) {
  if (!isObj(obj)) return <p className="text-sm text-muted-foreground">—</p>;
  if (obj.tidakAda === true) return <p className="text-sm text-muted-foreground">Tidak ada.</p>;
  return <>{fields.map((f) => <Row key={f.name} label={f.label} value={fieldValue(obj, f)} />)}</>;
}

function HarGiDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const role = useV2Role();
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = harGi.useOne(id);
  const submitM = useSubmitHarGi();
  const updateM = harGi.useUpdate();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const back = (
    <Button variant="outline" onClick={() => navigate({ to: "/har-gi" })}>
      <ArrowLeft className="size-4" /> Kembali
    </Button>
  );

  if (isLoading || !data) {
    return (
      <div>
        <PageHeader title="Detail Laporan HAR GI" actions={back} />
        <p className="text-sm text-muted-foreground">Memuat…</p>
      </div>
    );
  }

  const linkedWo = data.workOrderId ?? null;
  const isOwner = !!data.inspector?.id && data.inspector.id === user?.id;
  const editable = (data.status === "DRAFT" || data.status === "REJECTED") && (isOwner || role === "PETUGAS");

  if (editing) {
    return (
      <div>
        <PageHeader
          title={`Revisi Laporan HAR GI · ${data.location?.name ?? "—"}`}
          description="Perbaiki laporan lalu simpan / kirim ulang."
          actions={<Button variant="outline" onClick={() => setEditing(false)}><ArrowLeft className="size-4" /> Batal</Button>}
        />
        <HarGiForm
          initial={data}
          submitting={saving}
          onCancel={() => setEditing(false)}
          onSubmit={async (values: CreateHarGi, intent: SubmitIntent) => {
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

  const penyebab = Array.isArray(data.penyebabGangguan) ? data.penyebabGangguan : [];
  const pen = (isObj(data.penanganan) ? data.penanganan : {}) as Record<string, unknown>;
  const sd = (isObj(data.serialDevice) ? data.serialDevice : {}) as Record<string, unknown>;
  const cctv = (isObj(data.cctv) ? data.cctv : {}) as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Laporan HAR GI · ${data.location?.name ?? "—"}`}
        description={`${data.feeder?.feederName ?? "Tanpa penyulang"} · ${fmtDate(data.reportDate)}`}
        actions={
          <div className="flex gap-2">
            {editable && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> {data.status === "REJECTED" ? "Revisi" : "Edit"}
              </Button>
            )}
            {back}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <GiStatusBadge status={data.status} />
        {data.statusGarduSesudah && (
          <Badge variant={data.statusGarduSesudah === "INSCAN" ? "default" : "destructive"}>
            Sesudah: {data.statusGarduSesudah}
          </Badge>
        )}
        {data.statusPekerjaan && <Badge variant="outline">Pekerjaan: {data.statusPekerjaan}</Badge>}
        {data.pelaksana && <Badge variant="outline">Pelaksana: {data.pelaksana}</Badge>}
        {data.pengawas && <Badge variant="outline">Pengawas: {data.pengawas}</Badge>}
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

      {data.status === "REJECTED" && data.validationNote && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <Row label="Catatan Penolakan (perbaiki lalu kirim ulang)" value={data.validationNote} />
          </CardContent>
        </Card>
      )}

      {/* Penanganan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Penanganan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-1 border-b border-border/50 py-1.5">
            <span className="text-xs text-muted-foreground">Penyebab Gangguan</span>
            <div className="flex flex-wrap gap-1">
              {penyebab.length === 0 ? (
                <span className="text-sm">—</span>
              ) : (
                penyebab.map((p) => <Badge key={p} variant="secondary" className="text-[11px]">{p}</Badge>)
              )}
            </div>
          </div>
          <Row label="Keterangan Kunjungan" value={data.ketKunjungan} />
          <Row label="Status Gardu Sebelum" value={data.statusGarduSebelum} />
          <Row label="Status Gardu Sesudah" value={data.statusGarduSesudah} />
          <Row label="Analisa Penyebab" value={pen.analisa as string} />
          <Row label="Langkah Pekerjaan" value={pen.langkah as string} />
          <Row label="Hasil Pekerjaan" value={pen.hasil as string} />
          <Row label="Tambahan" value={pen.tambahan as string} />
          <Row label="Catatan Lain" value={pen.catatanLain as string} />
        </CardContent>
      </Card>

      {/* Seksi perangkat: I/O, Relay, Rectifier, Baterai */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {HAR_FLAT_SECTIONS.map((s) => (
          <Card key={s.key}>
            <CardHeader>
              <CardTitle className="text-sm">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {s.fields.map((f) => (
                <Row key={f.name} label={f.label} value={fieldValue((data[s.key] as Record<string, unknown>) ?? {}, f)} />
              ))}
            </CardContent>
          </Card>
        ))}

        {/* Serial Device */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Serial Device</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Row label="Jumlah Serial Device" value={(sd.jumlah as string) ?? null} />
            <p className="text-xs font-medium text-muted-foreground">Device Utama</p>
            <DeviceView obj={sd.utama} fields={HAR_SERIAL_FIELDS} />
            <p className="text-xs font-medium text-muted-foreground">Device Ke-2</p>
            {sd.device2TidakAda === true ? (
              <p className="text-sm text-muted-foreground">Tidak ada.</p>
            ) : (
              <DeviceView obj={sd.device2} fields={HAR_SERIAL_FIELDS} />
            )}
          </CardContent>
        </Card>

        {/* CCTV */}
        <Card>
          <CardHeader><CardTitle className="text-sm">CCTV</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {HAR_CCTV_PARTS.map((p) => (
              <div key={p.key}>
                <p className="text-xs font-medium text-muted-foreground">{p.label}</p>
                {cctv[`${p.key}TidakAda`] === true ? (
                  <p className="text-sm text-muted-foreground">Tidak ada.</p>
                ) : (
                  <DeviceView obj={cctv[p.key]} fields={p.fields} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {data.status !== "REJECTED" && data.validationNote && (
        <Card>
          <CardContent className="pt-6">
            <Row label="Catatan Validasi" value={data.validationNote} />
          </CardContent>
        </Card>
      )}

      {!editable && !linkedWo && (
        <p className="text-sm text-muted-foreground">Tidak ada aksi tersedia untuk status saat ini.</p>
      )}
    </div>
  );
}
