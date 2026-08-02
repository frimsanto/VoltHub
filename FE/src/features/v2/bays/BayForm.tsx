// VoltHub — Bay create/edit form (GI → Bay master data).
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField, SelectField, SwitchField } from "@/components/v2/fields";
import { useLocationOptions } from "@/features/v2/lookups";
import { baySchema, emptyBay, type BayFormValues } from "./resource";

export function BayForm({
  defaultValues,
  mode = "create",
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues?: Partial<BayFormValues>;
  mode?: "create" | "edit";
  onSubmit: (values: BayFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const { options: giOptions, isLoading: giLoading } = useLocationOptions("GI");
  const { control, handleSubmit } = useForm<BayFormValues>({
    resolver: zodResolver(baySchema),
    defaultValues: { ...emptyBay, ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <SelectField
        control={control}
        name="locationId"
        label="GI"
        required
        disabled={mode === "edit" || giLoading}
        placeholder={giLoading ? "Memuat GI…" : "Pilih GI"}
        options={giOptions}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField control={control} name="code" label="Kode Bay" required placeholder="cth. BAY-01" />
        <TextField
          control={control}
          name="voltageLevel"
          label="Level Tegangan"
          placeholder="cth. 20kV"
        />
      </div>
      <TextField control={control} name="name" label="Nama Bay" required placeholder="cth. Bay Penyulang Senayan 1" />
      <SwitchField control={control} name="isActive" label="Aktif" />

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
