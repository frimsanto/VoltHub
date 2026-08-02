// VoltHub V2 — Location create/edit form.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField, TextareaField, NumberField, SelectField, SwitchField } from "@/components/v2/fields";
import { LOCATION_TYPES, toOptions } from "@/lib/v2/enums";
import { useAuthStore } from "@/stores/auth";
import { isRtupp1User } from "@/lib/v2/rtupp";
import { locationSchema, emptyLocation, type LocationFormValues } from "./resource";

export function LocationForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues?: Partial<LocationFormValues>;
  onSubmit: (values: LocationFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: { ...emptyLocation, ...defaultValues },
  });
  const { control, handleSubmit } = form;

  // UX guard only — the backend (location.service) is the enforcer. Scope the
  // "Tipe" options to the operator's RTUPP: RTUPP1 (GIS) → GI only; RTUPP2–5 →
  // GH & GARDU(MP). Global users (MASTER/MANAGER, no RTUPP) keep every option.
  // When editing, always keep the current type so a legacy value stays visible.
  const user = useAuthStore((s) => s.user);
  const typeValues = (() => {
    let allowed: readonly string[];
    if (!user?.rtupp) allowed = LOCATION_TYPES;
    else if (isRtupp1User(user)) allowed = ["GI"];
    else allowed = ["GH", "GARDU"];
    const current = defaultValues?.locationType;
    return current && !allowed.includes(current) ? [current, ...allowed] : allowed;
  })();

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          control={control}
          name="name"
          label="Nama"
          required
          placeholder="mis. GI Grogol / TD250 / GH0012"
        />
        <SelectField
          control={control}
          name="locationType"
          label="Tipe"
          required
          options={toOptions(typeValues)}
        />
      </div>
      <TextField control={control} name="up3" label="UP3" placeholder="UP3 ..." />
      <TextareaField control={control} name="address" label="Alamat" placeholder="Alamat lokasi" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField control={control} name="latitude" label="Latitude" placeholder="-6.20" />
        <NumberField control={control} name="longitude" label="Longitude" placeholder="106.81" />
      </div>
      <SwitchField control={control} name="status" label="Aktif" description="Lokasi aktif & tampil di daftar" />

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
