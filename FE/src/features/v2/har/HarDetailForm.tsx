// VoltHub — HAR detail form (add/edit). Asset scoped to the report's location.
// In edit mode the asset is fixed (one detail per asset), so the asset select is
// disabled and the asset id is preserved.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextareaField } from "@/components/v2/fields";
import { useAssetOptions } from "@/features/v2/lookups";
import { HAR_STATUSES, toOptions } from "@/lib/v2/enums";
import { harDetailSchema, emptyHarDetail, type HarDetailFormValues } from "./resource";

export function HarDetailForm({
  locationId,
  defaultValues,
  isEdit,
  onSubmit,
  onCancel,
  submitting,
}: {
  locationId?: string;
  defaultValues?: Partial<HarDetailFormValues>;
  isEdit?: boolean;
  onSubmit: (values: HarDetailFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const { options: assetOptions, isLoading } = useAssetOptions({ locationId });
  const form = useForm<HarDetailFormValues>({
    resolver: zodResolver(harDetailSchema),
    defaultValues: { ...emptyHarDetail, ...defaultValues },
  });
  const { control, handleSubmit } = form;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <SelectField
        control={control}
        name="assetId"
        label="Aset"
        required
        disabled={isEdit}
        placeholder={isLoading ? "Memuat aset…" : "Pilih aset di lokasi ini"}
        options={assetOptions}
      />
      <SelectField control={control} name="status" label="Status" required options={toOptions(HAR_STATUSES)} />
      <TextareaField control={control} name="analysis" label="Analisa" placeholder="Hasil analisa" />
      <TextareaField control={control} name="notes" label="Catatan" placeholder="Catatan / rekomendasi" />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Batal
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {isEdit ? "Simpan" : "Tambah Detail"}
        </Button>
      </div>
    </form>
  );
}
