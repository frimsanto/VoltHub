// VoltHub — HAR report create/edit form.
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SelectField, DateField } from "@/components/v2/fields";
import { useLocationOptions } from "@/features/v2/lookups";
import { HAR_TYPE_LABELS, type HarType } from "@/lib/v2/demo-adapter";
import { harReportSchema, emptyHarReport, type HarReportFormValues } from "./resource";

export function HarReportForm({
  onSubmit,
  onCancel,
  submitting,
  defaultValues,
  isEdit,
}: {
  onSubmit: (values: HarReportFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
  defaultValues?: HarReportFormValues;
  isEdit?: boolean;
}) {
  const { options: locationOptions, isLoading } = useLocationOptions();
  const form = useForm<HarReportFormValues>({
    resolver: zodResolver(harReportSchema),
    defaultValues: defaultValues ?? emptyHarReport,
  });
  const { control, handleSubmit } = form;

  // Type + attachments are demo-only (no backend field) — kept as local state.
  const [type, setType] = useState<HarType>("PREVENTIF");
  const [files, setFiles] = useState<File[]>([]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <SelectField
        control={control}
        name="locationId"
        label="Gardu"
        required
        placeholder={isLoading ? "Memuat gardu…" : "Pilih gardu"}
        options={locationOptions}
        disabled={isEdit}
      />
      <DateField control={control} name="reportDate" label="Tanggal Laporan" required />

      <div className="space-y-1.5">
        <Label className="text-sm">Jenis HAR</Label>
        <Select value={type} onValueChange={(v) => setType(v as HarType)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(HAR_TYPE_LABELS) as HarType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {HAR_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Lampiran</Label>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:border-primary/40">
          <Paperclip className="size-4" />
          <span>Pilih berkas (PDF, JPG, XLSX)…</span>
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])}
          />
        </label>
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs"
              >
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Hapus lampiran"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
