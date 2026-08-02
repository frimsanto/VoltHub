// VoltHub — Work Order assignment form (team only, no per-individual PIC).
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/v2/fields";
import { useTeamOptions } from "@/features/v2/lookups";

export interface AssignValues {
  teamId: string;
}

export function AssignForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues?: Partial<AssignValues>;
  onSubmit: (values: AssignValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const { options: teamOptions, isLoading: teamLoading } = useTeamOptions(true);
  const { control, handleSubmit } = useForm<AssignValues>({
    defaultValues: { teamId: defaultValues?.teamId ?? "" },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <SelectField
        control={control}
        name="teamId"
        label="Tim Pelaksana"
        required
        disabled={teamLoading}
        placeholder={teamLoading ? "Memuat tim…" : "Pilih tim"}
        options={teamOptions}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Batal
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          Tugaskan
        </Button>
      </div>
    </form>
  );
}
