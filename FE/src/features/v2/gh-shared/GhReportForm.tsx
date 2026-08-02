// VoltHub — Form Laporan Inspeksi GH / HAR GH (152 kolom, struktur SAMA; pola
// accordion meniru InspeksiGiForm). WO-locked, header read-only auto-fill.
// Kubikel = LIST DINAMIS per penyulang (dari feeders-by-GH atau manual/teks).
import { useState, useEffect } from "react";
import { useForm, useFieldArray, Controller, type Control } from "react-hook-form";
import { ChevronDown, Plus, Trash2, Save, Send } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TextField, TextareaField, NumberField, SelectField } from "@/components/v2/fields";
import { useAuthStore } from "@/stores/auth";
import { workOrders } from "@/features/v2/work-orders/resource";
import { useGhFeeders } from "@/features/v2/lookups";
import { toOptions } from "@/lib/v2/enums";
import { GhAttachments } from "./GhAttachments";
import {
  MobileStepSection,
  FormStepperHeader,
  FormStepperBottomBar,
} from "@/components/mobile/FormStepper";
import {
  GH_SECTIONS,
  GH_KESIMPULAN_LABELS,
  RELAY_DETAIL_GROUPS,
  KUBIKEL_STATUS_OPTIONS,
  emptyKubikelEntry,
  validateKubikelForSubmit,
  type GhFieldDef,
  type GhSectionDef,
  type KubikelEntry,
} from "./ghSections";

type FormValues = Record<string, unknown>;
export type SubmitIntent = "DRAFT" | "SUBMITTED";
export type GhReportVariant = "INSPEKSI" | "HAR";

const todayISO = () => new Date().toISOString().slice(0, 10);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const hasKesimpulan = (x: unknown) =>
  isObj(x) && typeof x.kesimpulan === "string" && x.kesimpulan.trim() !== "";
const isAbsent = (x: unknown) => isObj(x) && x.tidakAda === true;

export interface GhReportInitial {
  id?: string;
  workOrderId?: string | null;
  locationId?: string;
  feederId?: string | null;
  up3?: string | null;
  pelaksana?: string | null;
  reportDate?: string;
  location?: { name?: string | null } | null;
  feeder?: { feederName?: string | null } | null;
  [section: string]: unknown;
}

function buildDefaults(variant: GhReportVariant, initial?: GhReportInitial): FormValues {
  const v: FormValues = {
    workOrderId: initial?.workOrderId ?? "",
    locationId: initial?.locationId ?? "",
    reportDate: (initial?.reportDate ?? todayISO()).slice(0, 10),
    notes: (initial?.notes as string) ?? "",
    catatan: (initial?.catatan as string) ?? "",
  };
  for (const s of GH_SECTIONS) {
    if (s.key === "kubikel") continue;
    v[s.key] = (initial?.[s.key] as Record<string, unknown>) ?? {};
  }
  v.kubikel =
    Array.isArray(initial?.kubikel) && (initial!.kubikel as unknown[]).length > 0
      ? (initial!.kubikel as KubikelEntry[])
      : [];
  if (variant === "HAR") {
    v.statusGarduSebelum = (initial?.statusGarduSebelum as string) ?? "";
    v.statusGarduSesudah = (initial?.statusGarduSesudah as string) ?? "";
    v.statusPekerjaan = (initial?.statusPekerjaan as string) ?? "";
    v.penyebabGangguan = (initial?.penyebabGangguan as string[]) ?? [];
    v.penanganan = (initial?.penanganan as Record<string, unknown>) ?? {};
  }
  return v;
}

function validateForSubmit(variant: GhReportVariant, v: FormValues): Record<string, string> {
  const errs: Record<string, string> = {};
  const sec = (k: string) => v[k] as Record<string, unknown> | undefined;
  const absent = (k: string) => isObj(v[k]) && (v[k] as Record<string, unknown>).tidakAda === true;
  const need = (key: string, obj: unknown, msg = "Kesimpulan wajib diisi") => {
    if (!hasKesimpulan(obj)) errs[key] = msg;
  };

  if (!isAbsent(sec("supplyTr"))) need("supplyTr", sec("supplyTr"));
  need("rectifier", sec("rectifier"));
  need("baterai", sec("baterai"));
  need("rtu", sec("rtu"));
  need("media1", sec("media1"));
  if (!absent("media2")) need("media2", sec("media2"));

  const kubErr = validateKubikelForSubmit(v.kubikel);
  if (kubErr) errs.kubikel = kubErr;

  if (!absent("fdiRelay")) need("fdiRelay", sec("fdiRelay"), "Kesimpulan / data wajib diisi");
  if (!absent("aco")) need("aco", sec("aco"), "Kesimpulan / data wajib diisi");

  if (variant === "HAR") {
    need("penanganan", sec("penanganan"), "Analisa/hasil penanganan wajib diisi");
  }
  return errs;
}

function renderField(
  control: Control<FormValues>,
  prefix: string,
  f: GhFieldDef,
  disabled?: boolean,
) {
  const name = prefix ? `${prefix}.${f.name}` : f.name;
  if (f.kind === "select") {
    return (
      <SelectField
        key={name}
        control={control}
        name={name}
        label={f.label}
        disabled={disabled}
        options={toOptions(f.options ?? [])}
      />
    );
  }
  if (f.kind === "number") {
    return (
      <NumberField key={name} control={control} name={name} label={f.label} disabled={disabled} />
    );
  }
  if (f.kind === "textarea") {
    return (
      <TextareaField key={name} control={control} name={name} label={f.label} disabled={disabled} />
    );
  }
  if (f.kind === "select-other") {
    return (
      <TextField
        key={name}
        control={control}
        name={name}
        label={f.label}
        placeholder="pilih salah satu istilah baku / ketik bebas"
        disabled={disabled}
      />
    );
  }
  return <TextField key={name} control={control} name={name} label={f.label} disabled={disabled} />;
}

function AbsentToggle({
  control,
  name,
  label = "Tidak ada",
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
  const label = GH_KESIMPULAN_LABELS[value] ?? value;
  const variant = value === "BAIK" ? "default" : value === "RUSAK" ? "destructive" : "secondary";
  return (
    <Badge variant={variant as never} className="ml-2 text-[10px]">
      {label}
    </Badge>
  );
}

// ── KUBIKEL — list dinamis per penyulang ─────────────────────────────────────
function RelayDetailFields({
  control,
  entryPrefix,
}: {
  control: Control<FormValues>;
  entryPrefix: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {RELAY_DETAIL_GROUPS.map((g) => (
        <div key={g.key} className="space-y-1 rounded-md border p-2">
          <p className="text-xs font-medium text-muted-foreground">{g.label}</p>
          <SelectField
            control={control}
            name={`${entryPrefix}.relayDetail.${g.key}.cubicle`}
            label="Cubicle"
            options={toOptions(KUBIKEL_STATUS_OPTIONS.relayDetailPair)}
          />
          <SelectField
            control={control}
            name={`${entryPrefix}.relayDetail.${g.key}.master`}
            label="Master"
            options={toOptions(KUBIKEL_STATUS_OPTIONS.relayDetailPair)}
          />
        </div>
      ))}
    </div>
  );
}

function KubikelEntryCard({
  control,
  index,
  onRemove,
  disabled,
}: {
  control: Control<FormValues>;
  index: number;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [relayOpen, setRelayOpen] = useState(false);
  const prefix = `kubikel.${index}`;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-sm">Penyulang #{index + 1}</CardTitle>
        {!disabled && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            control={control}
            name={`${prefix}.namaPenyulang`}
            label="Nama Penyulang"
            disabled={disabled}
          />
          <TextField
            control={control}
            name={`${prefix}.merekCubicle`}
            label="Merek Cubicle"
            disabled={disabled}
          />
          <SelectField
            control={control}
            name={`${prefix}.tipeRc`}
            label="Tipe RC"
            disabled={disabled}
            options={toOptions(KUBIKEL_STATUS_OPTIONS.tipeRc)}
          />
          <SelectField
            control={control}
            name={`${prefix}.statusCubicle`}
            label="Status Cubicle"
            disabled={disabled}
            options={toOptions(KUBIKEL_STATUS_OPTIONS.statusCubicle)}
          />
          <SelectField
            control={control}
            name={`${prefix}.statusCubicleMaster`}
            label="Status Cubicle Master"
            disabled={disabled}
            options={toOptions(KUBIKEL_STATUS_OPTIONS.statusCubicle)}
          />
          <SelectField
            control={control}
            name={`${prefix}.statusLrCubicle`}
            label="Status L/R Cubicle"
            disabled={disabled}
            options={toOptions(KUBIKEL_STATUS_OPTIONS.statusLr)}
          />
          <SelectField
            control={control}
            name={`${prefix}.statusLrMaster`}
            label="Status L/R Master"
            disabled={disabled}
            options={toOptions(KUBIKEL_STATUS_OPTIONS.statusLr)}
          />
          <SelectField
            control={control}
            name={`${prefix}.mfsCubicle`}
            label="Status MFS Cubicle"
            disabled={disabled}
            options={toOptions(KUBIKEL_STATUS_OPTIONS.mfsHfd)}
          />
          <SelectField
            control={control}
            name={`${prefix}.mfsMaster`}
            label="Status MFS Master"
            disabled={disabled}
            options={toOptions(KUBIKEL_STATUS_OPTIONS.mfsHfd)}
          />
          <SelectField
            control={control}
            name={`${prefix}.hfdCubicle`}
            label="Status HFD Cubicle"
            disabled={disabled}
            options={toOptions(KUBIKEL_STATUS_OPTIONS.mfsHfd)}
          />
          <SelectField
            control={control}
            name={`${prefix}.hfdMaster`}
            label="Status HFD Master"
            disabled={disabled}
            options={toOptions(KUBIKEL_STATUS_OPTIONS.mfsHfd)}
          />
          <SelectField
            control={control}
            name={`${prefix}.testRcDummy`}
            label="Test RC/Dummy"
            disabled={disabled}
            options={toOptions(KUBIKEL_STATUS_OPTIONS.testRcDummy)}
          />
          <SelectField
            control={control}
            name={`${prefix}.statusRc`}
            label="Status RC"
            disabled={disabled}
            options={toOptions(KUBIKEL_STATUS_OPTIONS.statusRc)}
          />
        </div>
        <TextareaField
          control={control}
          name={`${prefix}.catatan`}
          label="Catatan Cubicle"
          disabled={disabled}
        />

        <Collapsible open={relayOpen} onOpenChange={setRelayOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="w-full justify-between">
              Relay Detail (opsional — CBTR/GFT/IGFT/OCT/IOCT/Beban/AMF)
              <ChevronDown
                className={`size-4 transition-transform ${relayOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <RelayDetailFields control={control} entryPrefix={prefix} />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function KubikelSection({
  control,
  locationId,
  disabled,
}: {
  control: Control<FormValues>;
  locationId?: string;
  disabled?: boolean;
}) {
  const { fields, append, remove } = useFieldArray({ control: control as never, name: "kubikel" });
  const { options: ghFeederOptions, isLoading } = useGhFeeders(locationId);
  const [pickerValue, setPickerValue] = useState("");

  const addFromDb = () => {
    if (!pickerValue) return;
    const chosen = ghFeederOptions.find((o) => o.value === pickerValue);
    append(emptyKubikelEntry({ penyulangId: pickerValue, namaPenyulang: chosen?.label ?? "" }));
    setPickerValue("");
  };
  const addManual = () => append(emptyKubikelEntry({ penyulangId: null }));

  return (
    <div className="space-y-4">
      {!disabled && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3">
          <div className="min-w-[220px] flex-1">
            <Label className="mb-1.5 block text-xs">Pilih dari daftar penyulang GH</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={pickerValue}
              onChange={(e) => setPickerValue(e.target.value)}
              disabled={isLoading || ghFeederOptions.length === 0}
            >
              <option value="">
                {isLoading
                  ? "Memuat…"
                  : ghFeederOptions.length === 0
                    ? "Belum ada data penyulang"
                    : "— pilih penyulang —"}
              </option>
              {ghFeederOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" onClick={addFromDb} disabled={!pickerValue}>
            <Plus className="size-4" /> Tambah dari DB
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={addManual}>
            <Plus className="size-4" /> Tambah Manual
          </Button>
        </div>
      )}

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">Belum ada penyulang ditambahkan.</p>
      )}

      <div className="space-y-3">
        {fields.map((f, i) => (
          <KubikelEntryCard
            key={f.id}
            control={control}
            index={i}
            onRemove={() => remove(i)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

function SectionAccordion({
  section,
  control,
  watch,
  error,
  locationId,
  disabled,
}: {
  section: GhSectionDef;
  control: Control<FormValues>;
  watch: (name: string) => unknown;
  error?: string;
  locationId?: string;
  disabled?: boolean;
}) {
  const sectionVal =
    section.key !== "kubikel"
      ? (watch(section.key) as Record<string, unknown> | undefined)
      : undefined;
  const absent = !!sectionVal?.tidakAda && section.absentable;

  return (
    <AccordionItem value={section.key} className={error ? "border-destructive" : undefined}>
      <AccordionTrigger className="text-sm">
        <span className="flex flex-1 items-center">
          {section.label}
          {section.key !== "kubikel" && <KesimpulanBadge value={sectionVal?.kesimpulan} />}
          {absent && (
            <Badge variant="outline" className="ml-2 text-[10px]">
              Tidak ada
            </Badge>
          )}
          {error && (
            <Badge variant="destructive" className="ml-2 text-[10px]">
              {error}
            </Badge>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        {section.absentable && <AbsentToggle control={control} name={`${section.key}.tidakAda`} />}
        {section.variant === "flat" && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(section.fields ?? []).map((f) =>
              renderField(control, section.key, f, absent || disabled),
            )}
          </div>
        )}
        {section.variant === "kubikel" && (
          <KubikelSection control={control} locationId={locationId} disabled={disabled} />
        )}
      </AccordionContent>
    </AccordionItem>
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

/**
 * Shortcut header: petugas pilih penyulang GH ini → langsung nambah entri baru
 * di section Kubikel (data & validasi TETAP satu-satunya lewat kubikel array;
 * ini murni jalan pintas UI, tidak ada field/identitas terpisah yang dikirim ke
 * BE — identitas laporan tetap auto-fill dari WO, anti-spoof).
 */
function QuickAddPenyulang({
  control,
  locationId,
}: {
  control: Control<FormValues>;
  locationId?: string;
}) {
  const { append } = useFieldArray({ control: control as never, name: "kubikel" });
  const { options: ghFeederOptions, isLoading } = useGhFeeders(locationId);
  const [value, setValue] = useState("");

  const add = () => {
    if (!value) return;
    const chosen = ghFeederOptions.find((o) => o.value === value);
    append(emptyKubikelEntry({ penyulangId: value, namaPenyulang: chosen?.label ?? "" }));
    setValue("");
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">Penyulang (tambah cepat ke Kubikel)</Label>
      <div className="flex gap-2">
        <select
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!locationId || isLoading || ghFeederOptions.length === 0}
        >
          <option value="">
            {!locationId
              ? "Menunggu GH…"
              : isLoading
                ? "Memuat…"
                : ghFeederOptions.length === 0
                  ? "Belum ada data penyulang"
                  : "— pilih penyulang —"}
          </option>
          {ghFeederOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" onClick={add} disabled={!value}>
          <Plus className="size-4" /> Tambah
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Menambah entri baru di section Kubikel di bawah — bisa juga pilih manual di sana.
      </p>
    </div>
  );
}

export function GhReportForm({
  variant,
  initial,
  submitting,
  onSubmit,
  onCancel,
  disabled,
}: {
  variant: GhReportVariant;
  initial?: GhReportInitial;
  submitting?: boolean;
  onSubmit: (values: Record<string, unknown>, intent: SubmitIntent) => void;
  onCancel?: () => void;
  /** true bila laporan tak lagi bisa diedit (mis. sudah SUBMITTED) — tampil read-only. */
  disabled?: boolean;
}) {
  const attachmentsBasePath = variant === "HAR" ? "/v1/gh/har" : "/v1/gh/inspeksi";
  return (
    <GhReportFormInner
      variant={variant}
      initial={initial}
      submitting={submitting}
      onSubmit={onSubmit}
      onCancel={onCancel}
      disabled={disabled}
      attachmentsBasePath={attachmentsBasePath}
    />
  );
}

function GhReportFormInner({
  variant,
  initial,
  submitting,
  onSubmit,
  onCancel,
  disabled,
  attachmentsBasePath,
}: {
  variant: GhReportVariant;
  initial?: GhReportInitial;
  submitting?: boolean;
  onSubmit: (values: Record<string, unknown>, intent: SubmitIntent) => void;
  onCancel?: () => void;
  attachmentsBasePath: string;
  /** true bila laporan tak lagi bisa diedit (mis. sudah SUBMITTED) — tampil read-only. */
  disabled?: boolean;
}) {
  const { control, handleSubmit, watch } = useForm<FormValues>({
    defaultValues: buildDefaults(variant, initial),
  });
  const user = useAuthStore((s) => s.user);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [dateError, setDateError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<string[]>([GH_SECTIONS[0].key]);
  // Mobile-only 4-step chrome (Screens 4-7) — groups the SAME sections below by
  // visibility, not mount state, so RHF values/validation are unaffected and
  // desktop (md:block forces every group visible) never changes.
  const [mobileStep, setMobileStep] = useState(1);
  const STEP_LABELS: [string, string, string, string] = ["Info", "Pemeriksaan", "Foto", "Review"];
  // Every validated section lives in step 2 (Pemeriksaan) — jump back there so a
  // failed "Ajukan ke Approval" from step 4 doesn't leave the errors off-screen.
  useEffect(() => {
    if (Object.keys(sectionErrors).length > 0) setMobileStep(2);
  }, [sectionErrors]);

  const lockedWoId = (initial?.workOrderId ?? "") || undefined;
  const hasWo = !!lockedWoId;
  const woQ = workOrders.useOne(hasWo ? lockedWoId : undefined);
  const selectedWo = woQ.data;

  const locationId = initial?.locationId || selectedWo?.locationId;
  const garduDisplay = initial?.location?.name ?? selectedWo?.location?.name ?? "—";
  const up3Display = initial?.up3 ?? "Otomatis dari GH";
  const pelaksanaDisplay = initial?.pelaksana ?? selectedWo?.team?.name ?? "—";

  const buildPayload = (raw: FormValues): Record<string, unknown> => {
    const stripIfAbsent = (key: string) => {
      const obj = (raw[key] as Record<string, unknown>) ?? {};
      return obj.tidakAda === true ? { tidakAda: true } : obj;
    };
    const payload: Record<string, unknown> = {
      workOrderId: lockedWoId,
      reportDate: raw.reportDate,
      supplyTr: stripIfAbsent("supplyTr"),
      rectifier: raw.rectifier,
      baterai: raw.baterai,
      rtu: raw.rtu,
      media1: raw.media1,
      media2: stripIfAbsent("media2"),
      kubikel: raw.kubikel,
      fdiRelay: stripIfAbsent("fdiRelay"),
      aco: stripIfAbsent("aco"),
      notes: (raw.notes as string) || null,
      catatan: (raw.catatan as string) || null,
    };
    if (variant === "HAR") {
      payload.statusGarduSebelum = (raw.statusGarduSebelum as string) || null;
      payload.statusGarduSesudah = (raw.statusGarduSesudah as string) || null;
      payload.statusPekerjaan = (raw.statusPekerjaan as string) || null;
      payload.penyebabGangguan = raw.penyebabGangguan ?? [];
      payload.penanganan = raw.penanganan;
    }
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
        const errs = validateForSubmit(variant, raw);
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

  const mobileActiveStep = disabled ? null : mobileStep;

  return (
    <form className="space-y-4 pb-40 md:pb-0">
      {!disabled && <FormStepperHeader step={mobileStep} labels={STEP_LABELS} />}

      <MobileStepSection step={1} active={mobileActiveStep}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Identitas Laporan (otomatis dari Work Order)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ReadOnly
              label="Work Order"
              value={selectedWo?.woNumber ?? lockedWoId}
              hint="Laporan GH tertaut Work Order"
            />
            <ReadOnly label="Gardu Hubung" value={garduDisplay} />
            {!disabled ? (
              <QuickAddPenyulang control={control} locationId={locationId} />
            ) : (
              <div className="hidden md:block" />
            )}
            <ReadOnly label="UP3" value={up3Display} />
            <ReadOnly
              label="User (Pelapor)"
              value={user?.name ?? user?.email ?? "—"}
              hint="Akun login"
            />
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
                    disabled={disabled}
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

        {variant === "HAR" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status Pekerjaan HAR</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField
                control={control}
                name="statusGarduSebelum"
                label="Status Gardu Sebelum"
                disabled={disabled}
              />
              <TextField
                control={control}
                name="statusGarduSesudah"
                label="Status Gardu Sesudah"
                disabled={disabled}
              />
              <TextField
                control={control}
                name="statusPekerjaan"
                label="Status Pekerjaan"
                disabled={disabled}
              />
            </CardContent>
          </Card>
        )}
      </MobileStepSection>

      <MobileStepSection step={2} active={mobileActiveStep}>
        <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
          {GH_SECTIONS.map((s) => (
            <SectionAccordion
              key={s.key}
              section={s}
              control={control}
              watch={watch}
              error={sectionErrors[s.key]}
              locationId={locationId}
              disabled={disabled}
            />
          ))}
        </Accordion>

        {variant === "HAR" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Penanganan{" "}
                {sectionErrors.penanganan && (
                  <Badge variant="destructive" className="ml-2 text-[10px]">
                    {sectionErrors.penanganan}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextareaField
                control={control}
                name="penanganan.analisa"
                label="Analisa"
                disabled={disabled}
              />
              <TextareaField
                control={control}
                name="penanganan.langkah"
                label="Langkah Penanganan"
                disabled={disabled}
              />
              <TextareaField
                control={control}
                name="penanganan.hasil"
                label="Hasil"
                disabled={disabled}
              />
              <TextareaField
                control={control}
                name="penanganan.tambahan"
                label="Tindakan Tambahan"
                disabled={disabled}
              />
              <TextareaField
                control={control}
                name="penanganan.catatanLain"
                label="Catatan Lain"
                disabled={disabled}
              />
              <SelectField
                control={control}
                name="penanganan.kesimpulan"
                label="Kesimpulan Kondisi"
                disabled={disabled}
                options={toOptions(["BAIK", "PERLU_PENGECEKAN", "RUSAK"])}
              />
            </CardContent>
          </Card>
        )}
      </MobileStepSection>

      {/* DOM order matches the original (Catatan card, then Attachments) so
          desktop — which always shows every group — is byte-for-byte unchanged;
          only the step NUMBER (not position) drives which one shows on mobile. */}
      <MobileStepSection step={4} active={mobileActiveStep}>
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-2">
            <TextareaField control={control} name="catatan" label="Catatan" disabled={disabled} />
            <TextareaField control={control} name="notes" label="Lain-lain" disabled={disabled} />
          </CardContent>
        </Card>
      </MobileStepSection>

      <MobileStepSection step={3} active={mobileActiveStep}>
        <GhAttachments
          basePath={attachmentsBasePath}
          parentId={initial?.id}
          readOnly={!!disabled}
        />
      </MobileStepSection>

      {Object.keys(sectionErrors).length > 0 && (
        <p className="text-sm text-destructive">Lengkapi section yang ditandai sebelum mengirim.</p>
      )}

      {/* Desktop submit row — mobile uses the fixed FormStepperBottomBar instead. */}
      {!disabled && (
        <div className="hidden flex-wrap justify-end gap-2 md:flex">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              Batal
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={submit("DRAFT")} disabled={submitting}>
            <Save className="size-4" /> Simpan Draft
          </Button>
          <Button type="button" onClick={submit("SUBMITTED")} disabled={submitting}>
            <Send className="size-4" /> Simpan &amp; Kirim
          </Button>
        </div>
      )}

      {!disabled && (
        <FormStepperBottomBar
          step={mobileStep}
          onBack={() => setMobileStep((s) => Math.max(1, s - 1))}
          onNext={() => setMobileStep((s) => Math.min(4, s + 1))}
          onSaveDraft={submit("DRAFT")}
          onSubmit={submit("SUBMITTED")}
          submitting={submitting}
        />
      )}
    </form>
  );
}
