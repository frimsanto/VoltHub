// VoltHub — Work Order create/edit form (Operation Management System).
// Lokasi GI (RTUPP1) ATAU GH (RTUPP2-5): dropdown lokasi & opsi "laporan wajib"
// mengikuti unit user; MASTER melihat keduanya. Mismatch requiredReports↔tipe
// lokasi tak mungkin terkirim (opsi berganti per tipe; BE juga menolak 422).
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  TextField,
  SelectField,
  TextareaField,
  DateField,
  CheckboxGroupField,
} from "@/components/v2/fields";
import {
  useLocationOptions,
  useFeederOptions,
  useGhFeeders,
  useTeamOptions,
} from "@/features/v2/lookups";
import { GarduSearchInput, type GarduSearchResult } from "@/features/v2/mp-shared/GarduSearchInput";
import { useCan } from "@/lib/v2/rbac";
import { isRtupp1User } from "@/lib/v2/rtupp";
import { useAuthStore } from "@/stores/auth";
import {
  WO_TYPES,
  WO_TYPE_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  toOptions,
} from "@/lib/v2/enums";
import {
  workOrderSchema,
  emptyWorkOrder,
  GI_REPORT_OPTIONS,
  GH_REPORT_OPTIONS,
  MP_REPORT_OPTIONS,
  type WorkOrderFormValues,
} from "./resource";

const TYPE_OPTIONS = toOptions(WO_TYPES, WO_TYPE_LABELS);
const PRIORITY_OPTIONS = toOptions(TICKET_PRIORITIES, TICKET_PRIORITY_LABELS);

export function WorkOrderForm({
  defaultValues,
  mode = "create",
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues?: Partial<WorkOrderFormValues>;
  mode?: "create" | "edit";
  onSubmit: (values: WorkOrderFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const canAssign = useCan("workOrders.manage");
  const user = useAuthStore((s) => s.user);
  const rtupp1 = isRtupp1User(user);
  const isMaster = (user?.role ?? "").toUpperCase() === "MASTER";

  // Unit menentukan daftar lokasi: RTUPP1 → GI; RTUPP2-5 → GH atau GARDU (MP); MASTER → semua.
  const showGi = isMaster || rtupp1;
  const showGh = isMaster || !rtupp1;
  // Selalu fetch per-tipe (limit 100, ter-cache) — jangan pernah tanpa type
  // (akan menarik semua gardu distribusi).
  const { options: giOptions, isLoading: giLoading } = useLocationOptions("GI");
  const { options: ghOptions, isLoading: ghLoading } = useLocationOptions("GH");
  const { options: teamOptions, isLoading: teamLoading } = useTeamOptions(canAssign);

  // Untuk unit RTUPP2-5 (atau MASTER), pilih dulu target: GH (Gardu Hubung) atau
  // GARDU (Metering Point / Gardu Distribusi) — jumlah GARDU jauh lebih besar dari
  // GH sehingga dicari lewat GarduSearchInput (search-gardu, RTUPP-scoped),
  // bukan dropdown top-100 statis seperti GI/GH.
  const [mpMode, setMpMode] = useState(false);
  const [selectedGardu, setSelectedGardu] = useState<GarduSearchResult | null>(null);

  const locationOptions = useMemo(() => {
    if (showGi && showGh) {
      return [
        ...giOptions.map((o) => ({ ...o, label: `GI — ${o.label}` })),
        ...ghOptions.map((o) => ({ ...o, label: `GH — ${o.label}` })),
      ];
    }
    return showGh ? ghOptions : giOptions;
  }, [showGi, showGh, giOptions, ghOptions]);
  const locationsLoading = (showGi && giLoading) || (showGh && ghLoading);

  const form = useForm<WorkOrderFormValues>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: {
      ...emptyWorkOrder,
      // Default centang mengikuti unit (GH → Inspeksi GH).
      ...(showGh && !showGi ? { requiredReports: ["INSPEKSI_GH"] as WorkOrderFormValues["requiredReports"] } : {}),
      ...defaultValues,
    },
  });
  const { control, handleSubmit, setValue } = form;

  // Tipe lokasi terpilih (GI|GH|GARDU) — dari keanggotaan opsi GH / toggle mpMode.
  const locationId = useWatch({ control, name: "locationId" });
  const ghIdSet = useMemo(() => new Set(ghOptions.map((o) => o.value)), [ghOptions]);
  const locType: "GI" | "GH" | "GARDU" = mpMode
    ? "GARDU"
    : showGh && (!showGi || ghIdSet.has(locationId))
      ? "GH"
      : "GI";

  // Penyulang: GI → master feeders; GH → endpoint feeders-by-GH (scoped); GARDU
  // (MP) → tidak ada picker penyulang di WO (dipilih petugas di form laporan).
  const { options: giFeederOptions, isLoading: giFeederLoading } = useFeederOptions(
    locType === "GI" && locationId ? locationId : undefined,
  );
  const {
    options: ghFeederOptions,
    isLoading: ghFeederLoading,
  } = useGhFeeders(locType === "GH" && locationId ? locationId : undefined);
  const feederOptions = locType === "GH" ? ghFeederOptions : giFeederOptions;
  const feederLoading = locType === "GH" ? ghFeederLoading : giFeederLoading;
  const ghNoFeeders = locType === "GH" && !!locationId && !feederLoading && ghFeederOptions.length === 0;

  // Ganti tipe lokasi → reset centang laporan agar selalu cocok tipe (anti-422).
  const reportOptions = locType === "GH" ? GH_REPORT_OPTIONS : locType === "GARDU" ? MP_REPORT_OPTIONS : GI_REPORT_OPTIONS;
  const prevType = useRef(locType);
  useEffect(() => {
    if (prevType.current !== locType && mode === "create") {
      setValue(
        "requiredReports",
        [locType === "GH" ? "INSPEKSI_GH" : locType === "GARDU" ? "INSPEKSI_MP" : "GI"] as WorkOrderFormValues["requiredReports"],
      );
      setValue("feederId", null);
      if (locType !== "GARDU") setSelectedGardu(null);
    }
    prevType.current = locType;
  }, [locType, mode, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
      {/* Area field: scroll independen dari header/footer dialog (footer selalu
          terlihat) — parent EntityFormModal membungkus dgn flex-col+max-h agar
          flex-1/min-h-0 di sini punya tinggi pasti untuk dihitung. */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1 pr-1" data-lenis-prevent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField control={control} name="type" label="Jenis WO" required options={TYPE_OPTIONS} />
          <SelectField
            control={control}
            name="priority"
            label="Prioritas"
            options={PRIORITY_OPTIONS}
          />
        </div>

        <TextField
          control={control}
          name="title"
          label="Judul Pekerjaan"
          required
          placeholder="cth. Perbaikan RC Penyulang X"
        />

        {/* Target GH vs GARDU (MP) — hanya relevan untuk unit RTUPP2-5 / MASTER.
            GARDU (Metering Point / Gardu Distribusi) jumlahnya jauh lebih besar dari
            GH, jadi dicari lewat GarduSearchInput (autocomplete search-gardu),
            bukan dropdown statis top-100. */}
        {showGh && mode === "create" && (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={!mpMode ? "default" : "outline"}
              onClick={() => setMpMode(false)}
            >
              Gardu Hubung (GH)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mpMode ? "default" : "outline"}
              onClick={() => setMpMode(true)}
            >
              Gardu Distribusi / Metering Point (MP)
            </Button>
          </div>
        )}

        {/* Lokasi: GI/GH/GARDU & Penyulang. Untuk GH & GARDU: Admin HANYA menugaskan
            lokasinya — penyulang/gardu mana yang bermasalah baru diketahui tim
            lapangan saat mengisi laporan (kubikel dinamis di form Inspeksi/HAR
            GH & MP), jadi dropdown penyulang di WO disembunyikan untuk lokasi GH/GARDU.
            GI tetap seperti semula (penyulang opsional). */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {locType === "GARDU" ? (
            <div className="space-y-1.5">
              <Label className="text-sm">Gardu (Metering Point)</Label>
              <GarduSearchInput
                value={selectedGardu}
                disabled={mode === "edit"}
                onSelect={(g) => {
                  setSelectedGardu(g);
                  setValue("locationId", g.id, { shouldValidate: true });
                }}
              />
            </div>
          ) : (
            <SelectField
              control={control}
              name="locationId"
              label={showGi && showGh ? "GI / GH" : showGh ? "Gardu Hubung" : "GI"}
              required
              disabled={mode === "edit" || locationsLoading}
              placeholder={locationsLoading ? "Memuat lokasi…" : showGh && !showGi ? "Pilih GH" : "Pilih lokasi"}
              options={locationOptions}
            />
          )}
          {locType === "GH" ? (
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Penyulang</Label>
              <p className="text-xs text-muted-foreground">
                {!locationId
                  ? "Pilih GH dulu."
                  : feederLoading
                    ? "Memuat…"
                    : ghNoFeeders
                      ? "Belum ada data penyulang untuk GH ini — WO tetap bisa dibuat."
                      : `${ghFeederOptions.length} penyulang terdaftar pada GH ini — dipilih petugas saat mengisi laporan.`}
              </p>
            </div>
          ) : locType === "GARDU" ? (
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Kubikel</Label>
              <p className="text-xs text-muted-foreground">
                {selectedGardu
                  ? `UP3: ${selectedGardu.up3 ?? "—"}${selectedGardu.feederName ? ` · Penyulang: ${selectedGardu.feederName}` : ""} — data kubikel diisi petugas saat mengisi laporan.`
                  : "Cari & pilih gardu dulu."}
              </p>
            </div>
          ) : (
            <SelectField
              control={control}
              name="feederId"
              label="Penyulang (opsional)"
              disabled={!locationId || feederLoading}
              placeholder={!locationId ? "Pilih GI dulu" : feederLoading ? "Memuat…" : "Pilih penyulang (opsional)"}
              options={feederOptions}
            />
          )}
        </div>

        {/* Laporan wajib — opsi mengikuti tipe lokasi (GI → GI/HAR; GH → Inspeksi/HAR GH; GARDU → Inspeksi/HAR MP). */}
        <CheckboxGroupField
          control={control}
          name="requiredReports"
          label="Laporan yang harus diisi"
          required
          description="Petugas wajib melengkapi laporan yang dicentang sebelum WO dapat diajukan approval."
          options={reportOptions}
        />

        {/* Tim HANYA di mode create — endpoint update (PUT /:id) TIDAK menerima
            teamId (lihat updateWorkOrderSchema), jadi field ini di mode edit dulu
            tampil tapi senyap tak tersimpan (bug: Admin mengira sudah menugaskan,
            WO tak pernah muncul di "WO Saya" petugas). Perubahan tim SETELAH
            create dilakukan lewat tombol "Tugaskan" (assign endpoint, punya
            validasi transisi status sendiri). */}
        {canAssign && mode === "create" && (
          <SelectField
            control={control}
            name="teamId"
            label="Tim Pelaksana"
            required
            disabled={teamLoading}
            placeholder={teamLoading ? "Memuat tim…" : "Pilih tim"}
            options={teamOptions}
          />
        )}
        {canAssign && mode === "edit" && (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Tim Pelaksana diubah lewat tombol <strong>&quot;Tugaskan&quot;</strong> di halaman detail Work Order, bukan di form Edit ini.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField control={control} name="dueDate" label="Jatuh Tempo" />
          <TextField
            control={control}
            name="scadaEventRef"
            label="Ref. Event SCADA"
            placeholder="opsional"
          />
        </div>

        <TextareaField
          control={control}
          name="description"
          label="Deskripsi"
          placeholder="Detail pekerjaan / temuan SCADA…"
        />
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Batal
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          Simpan
        </Button>
      </div>
    </form>
  );
}
