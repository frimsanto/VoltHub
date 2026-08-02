// VoltHub V2 — Communication Media create/edit form.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField, TextareaField, SelectField, SwitchField } from "@/components/v2/fields";
import { MEDIA_TYPES, MEDIA_TYPE_LABELS, toOptions } from "@/lib/v2/enums";
import { useLocationOptions } from "@/features/v2/lookups";
import { commMediaSchema, emptyCommMedia, type CommMediaFormValues } from "./resource";

export function CommMediaForm({
  defaultValues,
  lockLocation,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues?: Partial<CommMediaFormValues>;
  lockLocation?: boolean;
  onSubmit: (values: CommMediaFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const { options, isLoading } = useLocationOptions();
  const form = useForm<CommMediaFormValues>({
    resolver: zodResolver(commMediaSchema),
    defaultValues: { ...emptyCommMedia, ...defaultValues },
  });
  const { control, handleSubmit } = form;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <SelectField
        control={control}
        name="locationId"
        label="Lokasi"
        required
        disabled={lockLocation || isLoading}
        options={options}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          control={control}
          name="mediaType"
          label="Tipe Media"
          required
          options={toOptions(MEDIA_TYPES, MEDIA_TYPE_LABELS)}
        />
        <TextField control={control} name="provider" label="Provider" placeholder="Telkomsel" />
      </div>
      <TextareaField control={control} name="notes" label="Catatan" />
      <SwitchField control={control} name="status" label="Aktif" description="Media aktif & tampil di daftar" />
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
