// VoltHub V2 — Asset create/edit form.
// Feeder & parent-asset options depend on the selected location. Optional
// relation selects use a "NONE" sentinel (Radix Select can't hold an empty
// value); it is normalised back to null on submit.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  TextField,
  TextareaField,
  NumberField,
  SelectField,
  type SelectOption,
} from "@/components/v2/fields";
import { ASSET_TYPES, ASSET_STATUSES, toOptions } from "@/lib/v2/enums";
import { useLocationOptions, useFeederOptions, useAssetOptions } from "@/features/v2/lookups";
import { assetSchema, emptyAsset, type AssetFormValues } from "./resource";

const NONE = "NONE";
const withNone = (opts: SelectOption[]): SelectOption[] => [
  { value: NONE, label: "(Tidak ada)" },
  ...opts,
];

export function AssetForm({
  defaultValues,
  lockLocation,
  excludeId,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues?: Partial<AssetFormValues>;
  lockLocation?: boolean;
  excludeId?: string;
  onSubmit: (values: AssetFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: { ...emptyAsset, ...defaultValues },
  });
  const { control, handleSubmit, watch } = form;
  const locationId = watch("locationId");

  const { options: locationOptions, isLoading: loadingLoc } = useLocationOptions();
  const { options: feederOptions } = useFeederOptions(locationId || undefined);
  const { options: assetOptions } = useAssetOptions({
    locationId: locationId || undefined,
    excludeId,
  });

  const submit = (values: AssetFormValues) => {
    onSubmit({
      ...values,
      feederId: values.feederId === NONE ? null : values.feederId,
      parentAssetId: values.parentAssetId === NONE ? null : values.parentAssetId,
    });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          control={control}
          name="locationId"
          label="Lokasi"
          required
          disabled={lockLocation || loadingLoc}
          options={locationOptions}
        />
        <SelectField
          control={control}
          name="feederId"
          label="Feeder"
          placeholder={locationId ? "Pilih feeder" : "Pilih lokasi dulu"}
          options={withNone(feederOptions)}
        />
        <SelectField
          control={control}
          name="assetType"
          label="Tipe Aset"
          required
          options={toOptions(ASSET_TYPES)}
        />
        <SelectField
          control={control}
          name="status"
          label="Status"
          options={toOptions(ASSET_STATUSES)}
        />
        <TextField control={control} name="assetName" label="Nama Aset" required />
        <SelectField
          control={control}
          name="parentAssetId"
          label="Parent Aset"
          placeholder={locationId ? "Pilih parent" : "Pilih lokasi dulu"}
          options={withNone(assetOptions)}
        />
      </div>

      <Separator />
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spesifikasi</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField control={control} name="brand" label="Merk" />
        <TextField control={control} name="model" label="Model" />
        <TextField control={control} name="serialNumber" label="Serial Number" />
        <NumberField control={control} name="tahunOperasi" label="Tahun Operasi" placeholder="2020" />
        <TextField control={control} name="capacity" label="Kapasitas" />
        <NumberField control={control} name="batteryCount" label="Jumlah Baterai" />
      </div>

      <Separator />
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Jaringan / Protokol
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField control={control} name="protocol" label="Protocol" />
        <TextField control={control} name="asdu" label="ASDU" />
        <TextField control={control} name="linkAddress" label="Link Address" />
        <TextField control={control} name="pairChannel" label="Pair / Channel" />
        <TextField control={control} name="masterIp1" label="Master IP 1" />
        <TextField control={control} name="masterIp2" label="Master IP 2" />
      </div>

      <TextareaField control={control} name="notes" label="Catatan" />

      <div className="flex justify-end gap-2 pt-2">
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
