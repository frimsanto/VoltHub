// VoltHub — Form Inspeksi GI (accordion sectioned, 176 kolom Laporan GI).
// Header READ-ONLY auto-fill (WO + login) · grid relay 3-state keyed · DRAFT vs Submit.
import { useState } from "react";
import { useForm, Controller, type Control } from "react-hook-form";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
} from "@/components/v2/fields";
import { useAuthStore } from "@/stores/auth";
import { workOrders } from "@/features/v2/work-orders/resource";
import {
  toOptions,
  GI_KESIMPULAN_LABELS,
} from "@/lib/v2/enums";
import {
  INSPEKSI_GI_SECTIONS,
  SERIAL_DEVICE_FIELDS,
  type GiFieldDef,
  type GiSectionDef,
  type CreateInspeksiGi,
  type InspeksiGiDetail,
} from "./resource";
import { LaporanGiAttachments } from "./LaporanGiAttachments";

type FormValues = Record<string, unknown>;
export type SubmitIntent = "DRAFT" | "SUBMITTED";

const todayISO = () => new Date().toISOString().slice(0, 10);

const KUBIKEL_ELEMENTS = [
  { key: "PMT", label: "PMT (OPEN/CLOSE)", type: "pmt" },
  { key: "LR", label: "LOCAL/REMOTE (L/R)", type: "lr" },
  { key: "ES", label: "ES (EARTHING SWITCH)", type: "generic_status" },
  { key: "RACK", label: "RACK IN/OUT", type: "rack" },
  { key: "MPUF", label: "MPUF", type: "generic_status" },
  { key: "IEDCF", label: "IEDCF", type: "generic_status" },
  { key: "TCS", label: "TCS", type: "generic_status" },
  { key: "CCS", label: "CCS", type: "generic_status" },
  { key: "CBTR", label: "CBTR", type: "generic_status" },
  { key: "GFT", label: "GFT", type: "generic_status" },
  { key: "IGFT", label: "IGFT", type: "generic_status" },
  { key: "OCT", label: "OCT", type: "generic_status" },
  { key: "IOCT", label: "IOCT", type: "generic_status" },
  { key: "MSF", label: "MSF", type: "generic_status" },
  { key: "PSF", label: "PSF", type: "generic_status" },
  { key: "CSF", label: "CSF", type: "generic_status" },
  { key: "I1", label: "I1 (ARUS BEBAN)", type: "measurement" },
  { key: "I2", label: "I2 (ARUS BEBAN)", type: "measurement" },
  { key: "I3", label: "I3 (ARUS BEBAN)", type: "measurement" },
  { key: "V1", label: "V1 (TEGANGAN TRAFO)", type: "measurement" },
  { key: "V2", label: "V2 (TEGANGAN TRAFO)", type: "measurement" },
  { key: "V3", label: "V3 (TEGANGAN TRAFO)", type: "measurement" },
  { key: "AMF_N", label: "AMF N", type: "measurement" },
  { key: "AMF_R", label: "AMF R", type: "measurement" },
  { key: "AMF_S", label: "AMF S", type: "measurement" },
  { key: "AMF_T", label: "AMF T", type: "measurement" },
  { key: "F", label: "FREKUENSI F", type: "measurement" },
  { key: "P", label: "ACTIVE POWER P", type: "measurement" },
  { key: "Q", label: "REACTIVE POWER Q", type: "measurement" },
  { key: "S", label: "APPARENT POWER S", type: "measurement" },
] as const;

function buildDefaults(initial?: Partial<InspeksiGiDetail>): FormValues {
  const v: FormValues = {
    workOrderId: initial?.workOrderId ?? "",
    locationId: initial?.locationId ?? "",
    feederId: initial?.feederId ?? "",
    reportDate: (initial?.reportDate ?? todayISO()).slice(0, 10),
    pelaksana: initial?.pelaksana ?? "",
    notes: initial?.notes ?? "",
    catatan: initial?.catatan ?? "",
  };
  for (const s of INSPEKSI_GI_SECTIONS) {
    v[s.key] = (initial?.[s.key as keyof InspeksiGiDetail] as Record<string, unknown>) ?? {};
  }
  return v;
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null;
const hasKesimpulan = (x: unknown) =>
  isObj(x) && typeof x.kesimpulan === "string" && x.kesimpulan.trim() !== "";

/** Validasi kesimpulan section AKTIF. */
function validateForSubmit(v: FormValues): Record<string, string> {
  const errs: Record<string, string> = {};
  const need = (key: string, obj: unknown, msg = "Kesimpulan wajib diisi") => {
    if (!hasKesimpulan(obj)) errs[key] = msg;
  };
  const sec = (k: string) => v[k] as Record<string, unknown> | undefined;
  const absent = (k: string) => isObj(v[k]) && (v[k] as Record<string, unknown>).tidakAda === true;

  need("rectifier", sec("rectifier"));
  if (!absent("rectifierBackup")) need("rectifierBackup", sec("rectifierBackup"));
  need("baterai", sec("baterai"));

  const sd = sec("serialDevice") ?? {};
  need("serialDevice", (sd as Record<string, unknown>).utama, "Kesimpulan Serial Device Utama wajib");
  if ((sd as Record<string, unknown>).device2TidakAda !== true)
    need("serialDevice", (sd as Record<string, unknown>).device2, "Kesimpulan Serial Device Ke-2 wajib");

  need("rtuIo", sec("rtuIo"));
  need("kubikel", sec("kubikel"));
  if (!absent("relayProteksi")) need("relayProteksi", sec("relayProteksi"));

  return errs;
}

function renderField(control: Control<FormValues>, prefix: string, f: GiFieldDef, disabled?: boolean) {
  const name = prefix ? `${prefix}.${f.name}` : f.name;
  if (f.kind === "select") {
    return (
      <SelectField
        key={name}
        control={control}
        name={name}
        label={f.label}
        disabled={disabled}
        options={toOptions(f.options ?? [], f.optionLabels)}
      />
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
      <TextField
        key={name}
        control={control}
        name={name}
        label={f.label}
        placeholder={(f.options ?? []).join(" / ") + " / lainnya"}
        disabled={disabled}
      />
    );
  }
  return <TextField key={name} control={control} name={name} label={f.label} disabled={disabled} />;
}

// ── Elements Grid Baru (3 Kolom per Elemen: Relay, Cubicle, Master) ──────────
function KubikelElementsForm({ control, disabled }: { control: Control<FormValues>; disabled?: boolean }) {
  const RELAY_OPTS = ["ON", "OFF", "TIDAK ADA"];
  
  return (
    <div className="overflow-x-auto rounded-lg border bg-card text-card-foreground shadow-sm">
      <table className="w-full min-w-[700px] border-collapse text-left text-xs">
        <thead className="bg-muted text-muted-foreground font-semibold">
          <tr>
            <th className="p-3">Nama Elemen</th>
            <th className="p-3 w-[260px]">Status Relay</th>
            <th className="p-3">Status Cubicle</th>
            <th className="p-3">Status di Master</th>
            <th className="p-3 w-[120px]">Hasil RC</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {KUBIKEL_ELEMENTS.map((el) => {
            const pathPrefix = `kubikel.elements.${el.key}`;

            return (
              <tr key={el.key} className="hover:bg-muted/30 transition-colors">
                <td className="p-3 font-medium">
                  {el.label}
                </td>
                
                {/* Status Relay (Toggle Group) */}
                <td className="p-3">
                  {el.type === "pmt" ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-muted-foreground font-mono">OPEN:</span>
                        <Controller
                          control={control}
                          name={`${pathPrefix}.relayOpen`}
                          render={({ field }) => (
                            <ToggleGroup type="single" size="sm" value={field.value ?? ""} onValueChange={field.onChange} disabled={disabled}>
                              {RELAY_OPTS.map((o) => (
                                <ToggleGroupItem key={o} value={o} className="h-6 px-1.5 text-[9px]">{o}</ToggleGroupItem>
                              ))}
                            </ToggleGroup>
                          )}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-muted-foreground font-mono">CLOSE:</span>
                        <Controller
                          control={control}
                          name={`${pathPrefix}.relayClose`}
                          render={({ field }) => (
                            <ToggleGroup type="single" size="sm" value={field.value ?? ""} onValueChange={field.onChange} disabled={disabled}>
                              {RELAY_OPTS.map((o) => (
                                <ToggleGroupItem key={o} value={o} className="h-6 px-1.5 text-[9px]">{o}</ToggleGroupItem>
                              ))}
                            </ToggleGroup>
                          )}
                        />
                      </div>
                    </div>
                  ) : el.type === "lr" ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-muted-foreground font-mono">LOCAL:</span>
                        <Controller
                          control={control}
                          name={`${pathPrefix}.relayLocal`}
                          render={({ field }) => (
                            <ToggleGroup type="single" size="sm" value={field.value ?? ""} onValueChange={field.onChange} disabled={disabled}>
                              {RELAY_OPTS.map((o) => (
                                <ToggleGroupItem key={o} value={o} className="h-6 px-1.5 text-[9px]">{o}</ToggleGroupItem>
                              ))}
                            </ToggleGroup>
                          )}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-muted-foreground font-mono">REMOTE:</span>
                        <Controller
                          control={control}
                          name={`${pathPrefix}.relayRemote`}
                          render={({ field }) => (
                            <ToggleGroup type="single" size="sm" value={field.value ?? ""} onValueChange={field.onChange} disabled={disabled}>
                              {RELAY_OPTS.map((o) => (
                                <ToggleGroupItem key={o} value={o} className="h-6 px-1.5 text-[9px]">{o}</ToggleGroupItem>
                              ))}
                            </ToggleGroup>
                          )}
                        />
                      </div>
                    </div>
                  ) : (
                    <Controller
                      control={control}
                      name={`${pathPrefix}.relay`}
                      render={({ field }) => (
                        <ToggleGroup type="single" size="sm" value={field.value ?? ""} onValueChange={field.onChange} disabled={disabled}>
                          {RELAY_OPTS.map((o) => (
                            <ToggleGroupItem key={o} value={o} className="h-6 px-1.5 text-[9px]">{o}</ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      )}
                    />
                  )}
                </td>

                {/* Status Cubicle */}
                <td className="p-3">
                  {el.type === "pmt" ? (
                    <SelectField control={control} name={`${pathPrefix}.cubicle`} label="" disabled={disabled} options={toOptions(["CLOSE", "OPEN"])} />
                  ) : el.type === "lr" ? (
                    <SelectField control={control} name={`${pathPrefix}.cubicle`} label="" disabled={disabled} options={toOptions(["REMOTE", "LOCAL"])} />
                  ) : el.type === "rack" ? (
                    <SelectField control={control} name={`${pathPrefix}.cubicle`} label="" disabled={disabled} options={toOptions(["RACK-IN", "RACK-OUT", "TIDAK ADA"])} />
                  ) : el.type === "generic_status" ? (
                    <SelectField control={control} name={`${pathPrefix}.cubicle`} label="" disabled={disabled} options={toOptions(["NORMAL", "ABNORMAL", "TIDAK ADA"])} />
                  ) : (
                    <TextField control={control} name={`${pathPrefix}.cubicle`} label="" disabled={disabled} placeholder="Nilai ukur / teks" />
                  )}
                </td>

                {/* Status di Master */}
                <td className="p-3">
                  {el.type === "pmt" || el.type === "lr" || el.key === "ES" || el.type === "rack" ? (
                    <SelectField control={control} name={`${pathPrefix}.master`} label="" disabled={disabled} options={toOptions(["SESUAI", "TIDAK SESUAI"])} />
                  ) : el.type === "generic_status" ? (
                    <SelectField control={control} name={`${pathPrefix}.master`} label="" disabled={disabled} options={toOptions(["TIMBUL", "TIDAK TIMBUL", "TIDAK ADA"])} />
                  ) : (
                    <TextField control={control} name={`${pathPrefix}.master`} label="" disabled={disabled} placeholder="Nilai ukur / teks" />
                  )}
                </td>

                {/* Hasil RC (Hanya PMT) */}
                <td className="p-3">
                  {el.type === "pmt" ? (
                    <SelectField control={control} name={`${pathPrefix}.hasilRc`} label="" disabled={disabled} options={toOptions(["BERHASIL", "GAGAL"])} />
                  ) : (
                    <span className="text-muted-foreground font-mono">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AbsentToggle({
  control,
  name,
  label = "Peralatan tidak ada",
}: {
  control: Control<FormValues>;
  name: string;
  label?: string;
}) {
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

function KesimpulanBadge({ value }: { value?: unknown }) {
  if (typeof value !== "string" || !value) return null;
  const label = GI_KESIMPULAN_LABELS[value as keyof typeof GI_KESIMPULAN_LABELS] ?? value;
  const variant =
    value === "BAIK" ? "default" : value === "RUSAK" ? "destructive" : "secondary";
  return <Badge variant={variant as never} className="ml-2 text-[10px]">{label}</Badge>;
}

export function InspeksiGiForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<InspeksiGiDetail>;
  submitting?: boolean;
  onSubmit: (values: CreateInspeksiGi, intent: SubmitIntent) => void;
  onCancel?: () => void;
}) {
  const { control, handleSubmit, watch } = useForm<FormValues>({
    defaultValues: buildDefaults(initial),
  });
  const user = useAuthStore((s) => s.user);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [dateError, setDateError] = useState<string | null>(null);

  const lockedWoId = (initial?.workOrderId ?? "") || undefined;
  const hasWo = !!lockedWoId;
  const woLockedQ = workOrders.useOne(hasWo ? lockedWoId : undefined);
  const selectedWo = woLockedQ.data;

  const garduDisplay = hasWo ? selectedWo?.location?.name ?? "—" : initial?.location?.name ?? "—";
  const penyulangDisplay = hasWo ? selectedWo?.feeder?.feederName ?? "—" : initial?.feeder?.feederName ?? "—";
  const up3Display = initial?.up3 ?? "Otomatis dari GI";
  const pelaksanaDisplay = hasWo ? selectedWo?.team?.name ?? "—" : initial?.pelaksana ?? "—";

  const buildPayload = (raw: FormValues): CreateInspeksiGi => {
    const stripIfAbsent = (key: string) => {
      const obj = (raw[key] as Record<string, unknown>) ?? {};
      return obj.tidakAda === true ? { tidakAda: true } : obj;
    };
    const payload: CreateInspeksiGi = {
      reportDate: raw.reportDate as string,
      ...(hasWo
        ? { workOrderId: lockedWoId }
        : {
            locationId: initial?.locationId ?? null,
            feederId: initial?.feederId ?? null,
            pelaksana: initial?.pelaksana ?? null,
          }),
      rectifier: raw.rectifier as Record<string, unknown>,
      rectifierBackup: stripIfAbsent("rectifierBackup"),
      baterai: raw.baterai as Record<string, unknown>,
      serialDevice: raw.serialDevice as Record<string, unknown>,
      rtuIo: raw.rtuIo as Record<string, unknown>,
      kubikel: raw.kubikel as Record<string, unknown>,
      relayProteksi: stripIfAbsent("relayProteksi"),
      notes: (raw.notes as string) || null,
      catatan: (raw.catatan as string) || null,
    };
    return payload;
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
        const errs = validateForSubmit(raw);
        setSectionErrors(errs);
        if (Object.keys(errs).length > 0) {
          setOpenSections((prev) => Array.from(new Set([...prev, ...Object.keys(errs)])));
          return;
        }
      } else {
        setSectionErrors({});
      }
      onSubmit(buildPayload(raw), intent);
    });

  const [openSections, setOpenSections] = useState<string[]>([INSPEKSI_GI_SECTIONS[0].key]);

  return (
    <form className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identitas Laporan (otomatis)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ReadOnly
            label="Work Order"
            value={hasWo ? selectedWo?.woNumber ?? lockedWoId : "—"}
            hint="Laporan GI tertaut Work Order"
          />
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
        </CardContent>
      </Card>

      <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
        {INSPEKSI_GI_SECTIONS.map((s) => (
          <SectionAccordion
            key={s.key}
            section={s}
            control={control}
            watch={watch}
            error={sectionErrors[s.key]}
          />
        ))}
      </Accordion>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-2">
          <TextareaField control={control} name="catatan" label="Catatan" />
          <TextareaField control={control} name="notes" label="Lain-lain" />
        </CardContent>
      </Card>

      <LaporanGiAttachments 
        laporanGiId={initial?.id} 
        readOnly={false} 
      />

      {Object.keys(sectionErrors).length > 0 && (
        <p className="text-sm text-destructive">
          Lengkapi Kesimpulan pada section yang ditandai sebelum mengirim.
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

function ReadOnly({ label, value, hint }: { label: string; value?: string; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input value={value ?? "—"} disabled readOnly />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionAccordion({
  section,
  control,
  watch,
  error,
}: {
  section: GiSectionDef;
  control: Control<FormValues>;
  watch: (name: string) => unknown;
  error?: string;
}) {
  const sectionVal = watch(section.key) as Record<string, unknown> | undefined;
  const absent = !!sectionVal?.tidakAda && section.absentable;
  const kesimpulanVal =
    section.key === "serialDevice"
      ? (sectionVal?.utama as Record<string, unknown> | undefined)?.kesimpulan
      : sectionVal?.kesimpulan;

  return (
    <AccordionItem value={section.key} className={error ? "border-destructive" : undefined}>
      <AccordionTrigger className="text-sm">
        <span className="flex flex-1 items-center">
          {section.label}
          <KesimpulanBadge value={kesimpulanVal} />
          {absent && <Badge variant="outline" className="ml-2 text-[10px]">Tidak ada</Badge>}
          {error && <Badge variant="destructive" className="ml-2 text-[10px]">{error}</Badge>}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        {section.absentable && <AbsentToggle control={control} name={`${section.key}.tidakAda`} />}

        {section.variant === "flat" && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(section.fields ?? []).map((f) => renderField(control, section.key, f, absent))}
          </div>
        )}

        {section.variant === "serialDevice" && (
          <SerialDeviceSection control={control} watch={watch} />
        )}

        {section.variant === "kubikel" && <KubikelSection control={control} />}
      </AccordionContent>
    </AccordionItem>
  );
}

function SerialDeviceSection({
  control,
  watch,
}: {
  control: Control<FormValues>;
  watch: (name: string) => unknown;
}) {
  const device2Absent = !!(watch("serialDevice.device2Toggle") as boolean) || !!(watch("serialDevice.device2TidakAda") as boolean);
  return (
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
          {SERIAL_DEVICE_FIELDS.map((f) => renderField(control, "serialDevice.utama", f))}
        </div>
      </fieldset>
      <AbsentToggle control={control} name="serialDevice.device2TidakAda" label="Serial Device Ke-2 tidak ada" />
      <fieldset className="rounded-md border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Device Ke-2</legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {SERIAL_DEVICE_FIELDS.map((f) => renderField(control, "serialDevice.device2", f, device2Absent))}
        </div>
      </fieldset>
    </div>
  );
}

function KubikelSection({ control }: { control: Control<FormValues> }) {
  return (
    <div className="space-y-4">
      <TextField control={control} name="kubikel.merekCubicle" label="Merek Cubicle" />
      
      <div>
        <Label className="mb-2 block text-sm font-semibold text-muted-foreground">Grid Relay &amp; Elemen (30+ titik · 3 Kolom per Elemen)</Label>
        <KubikelElementsForm control={control} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {renderField(control, "kubikel", { name: "keterangan", label: "Keterangan", kind: "textarea" })}
        {renderField(control, "kubikel", {
          name: "kesimpulan",
          label: "Kesimpulan Kondisi",
          kind: "select",
          options: ["BAIK", "PERLU_PENGECEKAN", "RUSAK", "TIDAK_ADA"],
          optionLabels: GI_KESIMPULAN_LABELS as Record<string, string>,
        })}
      </div>
    </div>
  );
}
