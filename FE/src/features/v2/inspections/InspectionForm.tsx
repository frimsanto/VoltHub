// VoltHub — Inspection create form.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, DateField, TextareaField } from "@/components/v2/fields";
import { useLocationOptions } from "@/features/v2/lookups";
import { inspectionSchema, emptyInspection, type InspectionFormValues } from "./resource";

export function InspectionForm({
  onSubmit,
  onCancel,
  submitting,
}: {
  onSubmit: (values: InspectionFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const { options: locationOptions, isLoading } = useLocationOptions();
  const form = useForm<InspectionFormValues>({
    resolver: zodResolver(inspectionSchema),
    defaultValues: emptyInspection,
  });
  const { control, handleSubmit } = form;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <SelectField
        control={control}
        name="locationId"
        label="Lokasi"
        required
        placeholder={isLoading ? "Memuat lokasi…" : "Pilih lokasi"}
        options={locationOptions}
      />
      <DateField control={control} name="inspectionDate" label="Tanggal Inspeksi" required />
      <TextareaField control={control} name="notes" label="Catatan" placeholder="Catatan inspeksi (opsional)" />

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
