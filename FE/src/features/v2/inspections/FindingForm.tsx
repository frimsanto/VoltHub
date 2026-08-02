// VoltHub — Inspection finding form (asset scoped to the inspection's location).
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextareaField } from "@/components/v2/fields";
import { useAssetOptions } from "@/features/v2/lookups";
import { INSPECTION_STATUSES, toOptions } from "@/lib/v2/enums";
import { findingSchema, emptyFinding, type FindingFormValues } from "./resource";

export function FindingForm({
  locationId,
  onSubmit,
  onCancel,
  submitting,
}: {
  locationId?: string;
  onSubmit: (values: FindingFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const { options: assetOptions, isLoading } = useAssetOptions({ locationId });
  const form = useForm<FindingFormValues>({
    resolver: zodResolver(findingSchema),
    defaultValues: emptyFinding,
  });
  const { control, handleSubmit } = form;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <SelectField
        control={control}
        name="assetId"
        label="Aset"
        required
        placeholder={isLoading ? "Memuat aset…" : "Pilih aset di lokasi ini"}
        options={assetOptions}
      />
      <SelectField
        control={control}
        name="status"
        label="Status"
        required
        options={toOptions(INSPECTION_STATUSES)}
      />
      <TextareaField control={control} name="finding" label="Temuan" placeholder="Deskripsi temuan" />
      <TextareaField
        control={control}
        name="recommendation"
        label="Rekomendasi"
        placeholder="Rekomendasi tindak lanjut"
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Batal
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          Tambah Temuan
        </Button>
      </div>
    </form>
  );
}
