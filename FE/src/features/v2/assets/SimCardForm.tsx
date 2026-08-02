// VoltHub V2 — SIM card create/edit form.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField, NumberField } from "@/components/v2/fields";
import { simCardSchema, emptySimCard, type SimCardFormValues } from "./simcards";

export function SimCardForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues?: Partial<SimCardFormValues>;
  onSubmit: (values: SimCardFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const form = useForm<SimCardFormValues>({
    resolver: zodResolver(simCardSchema),
    defaultValues: { ...emptySimCard, ...defaultValues },
  });
  const { control, handleSubmit } = form;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField control={control} name="simSlot" label="Slot" required placeholder="1" />
        <TextField control={control} name="provider" label="Provider" placeholder="Telkomsel" />
        <TextField control={control} name="phoneNumber" label="Nomor" placeholder="0812…" />
        <TextField control={control} name="iccid" label="ICCID" />
      </div>
      <TextField control={control} name="ipAddress" label="IP Address" placeholder="10.0.0.1" />
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
