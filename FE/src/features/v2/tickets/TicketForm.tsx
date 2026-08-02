// VoltHub — Ticket create/edit form (reused for both flows).
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextField, SelectField, TextareaField } from "@/components/v2/fields";
import { useLocationOptions, useUserOptions } from "@/features/v2/lookups";
import { useCan } from "@/lib/v2/rbac";
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  toOptions,
} from "@/lib/v2/enums";
import { ticketSchema, emptyTicket, type TicketFormValues } from "./resource";

const PRIORITY_OPTIONS = toOptions(TICKET_PRIORITIES, TICKET_PRIORITY_LABELS);
const STATUS_OPTIONS = toOptions(TICKET_STATUSES, TICKET_STATUS_LABELS);

export function TicketForm({
  defaultValues,
  mode = "create",
  lockLocation,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues?: Partial<TicketFormValues>;
  /** "edit" surfaces the status field; "create" surfaces the attachment field. */
  mode?: "create" | "edit";
  /** When opened from a Gardu detail, the location is fixed. */
  lockLocation?: boolean;
  onSubmit: (values: TicketFormValues, attachment?: File | null) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const { options: locationOptions, isLoading: locLoading } = useLocationOptions();
  const canAssign = useCan("tickets.write");
  const { options: userOptions, isLoading: userLoading } = useUserOptions(canAssign);
  const [attachment, setAttachment] = useState<File | null>(null);

  const form = useForm<TicketFormValues>({
    resolver: zodResolver(ticketSchema),
    defaultValues: { ...emptyTicket, ...defaultValues },
  });
  const { control, handleSubmit } = form;

  return (
    <form
      onSubmit={handleSubmit((values) => onSubmit(values, attachment))}
      className="space-y-4"
    >
      <SelectField
        control={control}
        name="locationId"
        label="Gardu"
        required
        disabled={lockLocation || locLoading}
        placeholder={locLoading ? "Memuat gardu…" : "Pilih gardu"}
        options={locationOptions}
      />
      <TextField
        control={control}
        name="category"
        label="Kategori"
        required
        placeholder="cth. Gangguan Komunikasi"
      />
      <SelectField
        control={control}
        name="priority"
        label="Prioritas"
        required
        options={PRIORITY_OPTIONS}
      />
      {mode === "edit" && (
        <SelectField control={control} name="status" label="Status" options={STATUS_OPTIONS} />
      )}
      {canAssign && (
        <SelectField
          control={control}
          name="assignedTo"
          label="Ditugaskan Ke"
          disabled={userLoading}
          placeholder={userLoading ? "Memuat petugas…" : "Belum ditugaskan"}
          options={userOptions}
        />
      )}
      <TextareaField
        control={control}
        name="notes"
        label="Deskripsi"
        required
        placeholder="Jelaskan gangguan / permintaan perbaikan…"
      />

      {mode === "create" && (
        <div className="space-y-1.5">
          <Label className="text-sm">Lampiran</Label>
          <Input
            type="file"
            onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
          />
          {attachment && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="size-3" /> {attachment.name}
            </p>
          )}
        </div>
      )}

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
