// VoltHub — Form Laporan HAR GI (korektif, 81 kolom). Accordion sectioned, WO-LOCKED
// (identitas read-only auto-fill dari Work Order). Pola mengikuti InspeksiGiForm.
import { useState } from "react";
import { useForm, Controller, type Control } from "react-hook-form";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Save, Send } from "lucide-react";
import {
  TextField,
  TextareaField,
  NumberField,
  SelectField,
  CheckboxGroupField,
} from "@/components/v2/fields";
import { useAuthStore } from "@/stores/auth";
import { workOrders } from "@/features/v2/work-orders/resource";
import {
  toOptions,
  HAR_KET_KUNJUNGAN,
  HAR_PENYEBAB,
  HAR_STATUS_GARDU,
  HAR_STATUS_PEKERJAAN,
  HAR_STATUS_PEKERJAAN_LABELS,
} from "@/lib/v2/enums";
import {
  HAR_FLAT_SECTIONS,
  HAR_SERIAL_FIELDS,
  HAR_CCTV_PARTS,
  type CreateHarGi,
  type HarGiDetail,
} from "./resource";
import type { GiFieldDef } from "@/features/v2/inspeksi-gi/resource";

type FormValues = Record<string, unknown>;
export type SubmitIntent = "DRAFT" | "SUBMITTED";

const todayISO = () => new Date().toISOString().slice(0, 10);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const nonEmpty = (x: unknown) => typeof x === "string" && x.trim() !== "";

function buildDefaults(initial?: Partial<HarGiDetail>): FormValues {
  return {
    workOrderId: initial?.workOrderId ?? "",
    reportDate: (initial?.reportDate ?? todayISO()).slice(0, 10),
    ketKunjungan: initial?.ketKunjungan ?? "",
    pengawas: initial?.pengawas ?? "",
    scadaRtuName: initial?.scadaRtuName ?? "",
    statusGarduSebelum: initial?.statusGarduSebelum ?? "",
    statusGarduSesudah: initial?.statusGarduSesudah ?? "",
    statusPekerjaan: initial?.statusPekerjaan ?? "",
    penyebabGangguan: Array.isArray(initial?.penyebabGangguan) ? initial?.penyebabGangguan : [],
    io: (initial?.io as Record<string, unknown>) ?? {},
    relay: (initial?.relay as Record<string, unknown>) ?? {},
    rectifier: (initial?.rectifier as Record<string, unknown>) ?? {},
    baterai: (initial?.baterai as Record<string, unknown>) ?? {},
    serialDevice: (initial?.serialDevice as Record<string, unknown>) ?? {},
    cctv: (initial?.cctv as Record<string, unknown>) ?? {},
    penanganan: (initial?.penanganan as Record<string, unknown>) ?? {},
  };
}

// ── Field renderer (mirror pola Laporan GI) ──────────────────────────────────
function renderField(control: Control<FormValues>, prefix: string, f: GiFieldDef, disabled?: boolean) {
  const name = prefix ? `${prefix}.${f.name}` : f.name;
  if (f.kind === "select") {
    return (
      <SelectField key={name} control={control} name={name} label={f.label} disabled={disabled}
        options={toOptions(f.options ?? [], f.optionLabels)} />
    );
  }
  if (f.kind === "number") {
    return <NumberField key={name} control={control} name={name} label={f.label} disabled={disabled} />;
  }
  if (f.kind === "textarea") {
    return <TextareaField key={name} control={control} name={name} label={f.label} disabled={disabled} />;
  }
  if (f.kind === "select-other") {
    return (
      <TextField key={name} control={control} name={name} label={f.label} disabled={disabled}
        placeholder={(f.options ?? []).join(" / ") + " / lainnya"} />
    );
  }
  return <TextField key={name} control={control} name={name} label={f.label} disabled={disabled} />;
}

function AbsentToggle({ control, name, label }: { control: Control<FormValues>; name: string; label: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
          <Switch checked={!!field.value} onCheckedChange={field.onChange} />
          <Label className="text-sm">{label}</Label>
        </div>
      )}
    />
  );
}

function ReadOnly({ label, value, hint }: { label: string; value?: string; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input value={value ?? "—"} disabled readOnly />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function HarGiForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<HarGiDetail>;
  submitting?: boolean;
  onSubmit: (values: CreateHarGi, intent: SubmitIntent) => void;
  onCancel?: () => void;
}) {
  const { control, handleSubmit, watch } = useForm<FormValues>({ defaultValues: buildDefaults(initial) });
  const user = useAuthStore((s) => s.user);
  const [errors, setErrors] = useState<string[]>([]);
  const [dateError, setDateError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<string[]>(["penanganan"]);

  // WO-LOCKED: identitas dari WO (tidak ada jalur Tanpa-WO).
  const lockedWoId = (initial?.workOrderId ?? "") || undefined;
  const woQ = workOrders.useOne(lockedWoId);
  const wo = woQ.data;
  const garduDisplay = wo?.location?.name ?? initial?.location?.name ?? "—";
  const penyulangDisplay = wo?.feeder?.feederName ?? initial?.feeder?.feederName ?? "—";
  const up3Display = initial?.up3 ?? wo?.location?.code ?? "Otomatis dari GI";
  const pelaksanaDisplay = wo?.team?.name ?? initial?.pelaksana ?? "—";

  const device2Absent = watch("serialDevice.device2TidakAda") === true;

  const buildPayload = (raw: FormValues): CreateHarGi => {
    const sd = (raw.serialDevice as Record<string, unknown>) ?? {};
    const cctv = (raw.cctv as Record<string, unknown>) ?? {};
    const cctvOut: Record<string, unknown> = {};
    for (const p of HAR_CCTV_PARTS) {
      const absent = !!cctv[`${p.key}TidakAda`];
      cctvOut[`${p.key}TidakAda`] = absent;
      cctvOut[p.key] = absent ? { tidakAda: true } : (cctv[p.key] as Record<string, unknown>) ?? {};
    }
    return {
      workOrderId: lockedWoId as string,
      reportDate: raw.reportDate as string,
      ketKunjungan: (raw.ketKunjungan as string) || null,
      pengawas: (raw.pengawas as string) || null,
      scadaRtuName: (raw.scadaRtuName as string) || null,
      statusGarduSebelum: (raw.statusGarduSebelum as string) || null,
      statusGarduSesudah: (raw.statusGarduSesudah as string) || null,
      statusPekerjaan: (raw.statusPekerjaan as string) || null,
      penyebabGangguan: Array.isArray(raw.penyebabGangguan) ? (raw.penyebabGangguan as string[]) : [],
      io: raw.io as Record<string, unknown>,
      relay: raw.relay as Record<string, unknown>,
      rectifier: raw.rectifier as Record<string, unknown>,
      baterai: raw.baterai as Record<string, unknown>,
      serialDevice: {
        jumlah: sd.jumlah ?? null,
        utama: (sd.utama as Record<string, unknown>) ?? {},
        device2TidakAda: device2Absent,
        device2: device2Absent ? { tidakAda: true } : (sd.device2 as Record<string, unknown>) ?? {},
      },
      cctv: cctvOut,
      penanganan: raw.penanganan as Record<string, unknown>,
    };
  };

  const submit = (intent: SubmitIntent) =>
    handleSubmit((raw) => {
      const rd = (raw.reportDate as string) ?? "";
      if (rd && rd > todayISO()) {
        setDateError("Tanggal pekerjaan tidak boleh di masa depan");
        return;
      }
      setDateError(null);
      if (intent === "SUBMITTED") {
        // Wajib minimal (mirror BE assertSubmittable): Status Gardu Sesudah +
        // Status Pekerjaan + Hasil Pekerjaan.
        const miss: string[] = [];
        if (!nonEmpty(raw.statusGarduSesudah)) miss.push("Status Gardu Sesudah");
        if (!nonEmpty(raw.statusPekerjaan)) miss.push("Status Pekerjaan");
        const pen = raw.penanganan;
        if (!nonEmpty(isObj(pen) ? pen.hasil : undefined)) miss.push("Hasil Pekerjaan");
        setErrors(miss);
        if (miss.length > 0) {
          setOpenSections((prev) => Array.from(new Set([...prev, "penanganan"])));
          return;
        }
      } else {
        setErrors([]);
      }
      onSubmit(buildPayload(raw), intent);
    });

  return (
    <form className="space-y-4">
      {/* Header READ-ONLY auto-fill dari WO */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identitas Laporan (otomatis dari Work Order)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ReadOnly label="Work Order" value={wo?.woNumber ?? lockedWoId} hint="Laporan HAR GI tertaut Work Order" />
          <div className="hidden md:block" />
          <ReadOnly label="Gardu Induk" value={garduDisplay} />
          <ReadOnly label="Penyulang" value={penyulangDisplay} />
          <ReadOnly label="UP3" value={up3Display} hint="Otomatis dari GI" />
          <ReadOnly label="User (Pelapor)" value={user?.name ?? user?.email ?? "—"} hint="Akun login" />
          <div className="space-y-1.5">
            <Label className="text-sm">Tanggal Pekerjaan</Label>
            <Controller
              control={control}
              name="reportDate"
              render={({ field }) => (
                <Input
                  type="date"
                  max={todayISO()}
                  value={(field.value as string) ?? ""}
                  onChange={(e) => {
                    setDateError(null);
                    field.onChange(e);
                  }}
                />
              )}
            />
            {dateError && <p className="text-xs text-destructive">{dateError}</p>}
          </div>
          <ReadOnly label="Pelaksana" value={pelaksanaDisplay} hint="Dari Work Order" />
          <TextField
            control={control}
            name="ketKunjungan"
            label="Keterangan Kunjungan"
            placeholder={HAR_KET_KUNJUNGAN.join(" / ") + " / lainnya"}
          />
          <TextField control={control} name="pengawas" label="Pengawas" />
        </CardContent>
      </Card>

      {/* Accordion per section */}
      <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
        {/* Flat device sections: I/O, Relay, Rectifier, Baterai */}
        {HAR_FLAT_SECTIONS.map((s) => (
          <AccordionItem key={s.key} value={s.key}>
            <AccordionTrigger className="text-sm">{s.label}</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {s.fields.map((f) => renderField(control, s.key, f))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}

        {/* Serial Device: utama + ke-2 (absentable) */}
        <AccordionItem value="serialDevice">
          <AccordionTrigger className="text-sm">Serial Device</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <SelectField
                control={control}
                name="serialDevice.jumlah"
                label="Jumlah Serial Device"
                options={toOptions(["TIDAK ADA", "ADA 1", "ADA 2"])}
              />
              <fieldset className="rounded-md border p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">Device Utama</legend>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {HAR_SERIAL_FIELDS.map((f) => renderField(control, "serialDevice.utama", f))}
                </div>
              </fieldset>
              <AbsentToggle control={control} name="serialDevice.device2TidakAda" label="Serial Device Ke-2 tidak ada" />
              <fieldset className="rounded-md border p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">Device Ke-2</legend>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {HAR_SERIAL_FIELDS.map((f) => renderField(control, "serialDevice.device2", f, device2Absent))}
                </div>
              </fieldset>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* CCTV: Bullet / PTZ / NVR / Switch PoE (masing-masing absentable) */}
        <AccordionItem value="cctv">
          <AccordionTrigger className="text-sm">CCTV</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              {HAR_CCTV_PARTS.map((p) => {
                const absent = watch(`cctv.${p.key}TidakAda`) === true;
                return (
                  <fieldset key={p.key} className="rounded-md border p-3">
                    <legend className="px-1 text-xs font-medium text-muted-foreground">{p.label}</legend>
                    <AbsentToggle control={control} name={`cctv.${p.key}TidakAda`} label={`${p.label} tidak ada`} />
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {p.fields.map((f) => renderField(control, `cctv.${p.key}`, f, absent))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Penanganan (blok teks + status) */}
        <AccordionItem value="penanganan" className={errors.length ? "border-destructive" : undefined}>
          <AccordionTrigger className="text-sm">
            <span className="flex flex-1 items-center">
              Penanganan
              {errors.length > 0 && (
                <Badge variant="destructive" className="ml-2 text-[10px]">Lengkapi {errors.length} field wajib</Badge>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <CheckboxGroupField
                control={control}
                name="penyebabGangguan"
                label="Penyebab Gangguan"
                options={HAR_PENYEBAB.map((v) => ({ value: v, label: v }))}
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SelectField control={control} name="statusGarduSebelum" label="Status Gardu Sebelum"
                  options={toOptions(HAR_STATUS_GARDU)} />
                <SelectField control={control} name="statusGarduSesudah" label="Status Gardu Sesudah"
                  options={toOptions(HAR_STATUS_GARDU)} />
                <SelectField control={control} name="statusPekerjaan" label="Status Pekerjaan"
                  options={toOptions(HAR_STATUS_PEKERJAAN, HAR_STATUS_PEKERJAAN_LABELS)} />
              </div>
              <TextareaField control={control} name="penanganan.analisa" label="Analisa Penyebab" />
              <TextareaField control={control} name="penanganan.langkah" label="Langkah Pekerjaan" />
              <TextareaField control={control} name="penanganan.hasil" label="Hasil Pekerjaan" />
              <TextareaField control={control} name="penanganan.tambahan" label="Tambahan" />
              <TextareaField control={control} name="penanganan.catatanLain" label="Catatan Lain" />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {errors.length > 0 && (
        <p className="text-sm text-destructive">
          Wajib diisi sebelum mengirim: {errors.join(", ")}.
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Batal
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={submit("DRAFT")} disabled={submitting}>
          <Save className="size-4" /> Simpan Draft
        </Button>
        <Button type="button" onClick={submit("SUBMITTED")} disabled={submitting}>
          <Send className="size-4" /> Simpan & Kirim
        </Button>
      </div>
    </form>
  );
}
