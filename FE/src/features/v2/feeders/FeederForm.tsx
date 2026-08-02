// VoltHub V2 — Feeder create/edit form.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField, SelectField } from "@/components/v2/fields";
import { useLocationOptions } from "@/features/v2/lookups";
import { feederSchema, emptyFeeder, type FeederFormValues } from "./resource";

export function FeederForm({
  defaultValues,
  lockLocation,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues?: Partial<FeederFormValues>;
  /** When opened from a Location detail, the location is fixed. */
  lockLocation?: boolean;
  onSubmit: (values: FeederFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const { options, isLoading } = useLocationOptions("GI");
  const form = useForm<FeederFormValues>({
    resolver: zodResolver(feederSchema),
    defaultValues: { ...emptyFeeder, ...defaultValues },
  });
  const { control, handleSubmit } = form;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <SelectField
        control={control}
        name="locationId"
        label="Gardu Induk"
        required
        disabled={lockLocation || isLoading}
        placeholder={isLoading ? "Memuat gardu induk…" : "Pilih gardu induk"}
        options={options}
      />
      <TextField
        control={control}
        name="feederName"
        label="Nama Penyulang"
        required
        placeholder="mis. Penyulang Gandul 1"
      />
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
