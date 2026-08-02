// VoltHub — Laporan WO form (hasil penyelesaian, menggantikan Laporan Akhir).
// Petugas mengisi hasil uji remote + analisis + foto, lalu Simpan / Ajukan Approval.
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2, Paperclip, Trash2, ExternalLink, Send, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField, TextareaField } from "@/components/v2/fields";
import { v2FileUrl } from "@/lib/api/v2";
import {
  WORK_RESULTS,
  WORK_RESULT_LABELS,
  CB_STATUSES,
  CB_STATUS_LABELS,
  toOptions,
} from "@/lib/v2/enums";
import { useAssetOptions } from "@/features/v2/lookups";
import {
  useSaveWorkOrderResult,
  useUploadWorkOrderPhotos,
  useWorkOrderPhotos,
  useDeleteWorkOrderPhoto,
  type WorkOrder,
  type WorkOrderResult,
} from "./resource";

const RESULT_OPTIONS = toOptions(WORK_RESULTS, WORK_RESULT_LABELS);
const CB_OPTIONS = toOptions(CB_STATUSES, CB_STATUS_LABELS);

export function WorkOrderResultForm({
  wo,
  canSubmit,
  onSubmitResult,
  submitting,
  onDone,
}: {
  wo: WorkOrder;
  /** Whether the "Ajukan Approval" button is available (status ON_PROGRESS). */
  canSubmit: boolean;
  /** Submit (with the result body) — drives ON_PROGRESS → WAITING_APPROVAL. */
  onSubmitResult: (body: WorkOrderResult) => void;
  submitting?: boolean;
  onDone: () => void;
}) {
  const saveM = useSaveWorkOrderResult();
  const photosQ = useWorkOrderPhotos(wo.id);
  const uploadM = useUploadWorkOrderPhotos();
  const deleteM = useDeleteWorkOrderPhoto();

  // TODO: Scope to Penyulang (feederId) if backend asset search API supports it in the future.
  // Currently, we fallback to scoping by GI (locationId).
  const { options: assetOptions, isLoading: assetLoading } = useAssetOptions({
    locationId: wo.locationId || undefined,
  });

  const { control, handleSubmit, getValues } = useForm<WorkOrderResult>({
    defaultValues: {
      hasilRC: wo.hasilRC ?? null,
      hasilLR: wo.hasilLR ?? null,
      hasilES: wo.hasilES ?? null,
      statusCB: wo.statusCB ?? null,
      penyebab: wo.penyebab ?? "",
      tindakan: wo.tindakan ?? "",
      rekomendasi: wo.rekomendasi ?? "",
      assetId: wo.assetId ?? null,
    },
  });

  const [files, setFiles] = useState<File[]>([]);
  const handleUpload = () => {
    if (files.length) uploadM.mutate({ id: wo.id, files, category: "FOTO_HASIL" }, { onSuccess: () => setFiles([]) });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField control={control} name="hasilRC" label="Hasil RC" options={RESULT_OPTIONS} />
        <SelectField control={control} name="hasilLR" label="Hasil LR" options={RESULT_OPTIONS} />
        <SelectField control={control} name="hasilES" label="Hasil ES" options={RESULT_OPTIONS} />
        <SelectField control={control} name="statusCB" label="Status CB" options={CB_OPTIONS} />
        <div className="sm:col-span-2">
          <SelectField
            control={control}
            name="assetId"
            label="Aset (opsional)"
            disabled={assetLoading}
            placeholder={assetLoading ? "Memuat…" : "Pilih aset (opsional)"}
            options={assetOptions}
          />
        </div>
      </div>
      <TextareaField control={control} name="penyebab" label="Penyebab" placeholder="Penyebab gangguan…" />
      <TextareaField control={control} name="tindakan" label="Tindakan" placeholder="Tindakan perbaikan…" />
      <TextareaField control={control} name="rekomendasi" label="Rekomendasi" placeholder="Rekomendasi…" />

      {/* Foto sesudah / hasil */}
      <div className="space-y-2">
        <Label className="text-sm">Foto Hasil</Label>
        <div className="flex items-center gap-2">
          <Input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <Button type="button" variant="outline" disabled={!files.length || uploadM.isPending} onClick={handleUpload}>
            {uploadM.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Unggah
          </Button>
        </div>
        {photosQ.data && photosQ.data.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {photosQ.data.map((ph) => (
              <li key={ph.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <a
                  href={v2FileUrl(ph.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-2 text-primary hover:underline"
                >
                  <Paperclip className="size-3.5 shrink-0" />
                  <span className="truncate">{ph.originalName}</span>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
                <button
                  type="button"
                  className="text-destructive hover:opacity-80"
                  onClick={() => deleteM.mutate({ id: wo.id, attachmentId: ph.id })}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={submitting || saveM.isPending}>
          Tutup
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={submitting || saveM.isPending}
          onClick={handleSubmit((v) => saveM.mutate({ id: wo.id, body: v }, { onSuccess: onDone }))}
        >
          {saveM.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          <Save className="size-4" /> Simpan Draft
        </Button>
        {canSubmit && (
          <Button type="button" disabled={submitting || saveM.isPending} onClick={() => onSubmitResult(getValues())}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            <Send className="size-4" /> Simpan &amp; Ajukan Approval
          </Button>
        )}
      </div>
    </div>
  );
}
