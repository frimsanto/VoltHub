// VoltHub — Document upload form. Drag & drop file picker + category + gardu
// (location) / asset relation. File via local state; metadata via RHF.
import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UploadCloud, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SelectField, TextField } from "@/components/v2/fields";
import { useLocationOptions, useAssetOptions } from "@/features/v2/lookups";
import { documentCategoryOptions } from "./categories";
import { documentUploadSchema, emptyDocumentUpload, type DocumentUploadValues } from "./resource";

const ACCEPT = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
const fmtSize = (b: number) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export function DocumentUploadForm({
  onSubmit,
  onCancel,
  submitting,
  lockLocationId,
  defaultLocationId,
}: {
  onSubmit: (values: DocumentUploadValues, file: File) => void;
  onCancel: () => void;
  submitting?: boolean;
  /** When set, the Gardu is fixed (used from Detail Gardu) and the select is hidden. */
  lockLocationId?: string;
  defaultLocationId?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const { options: locationOptions } = useLocationOptions();
  const form = useForm<DocumentUploadValues>({
    resolver: zodResolver(documentUploadSchema),
    defaultValues: {
      ...emptyDocumentUpload,
      locationId: lockLocationId ?? defaultLocationId ?? null,
    },
  });
  const { control, handleSubmit, watch } = form;
  const locationId = watch("locationId");
  const { options: assetOptions } = useAssetOptions({ locationId: locationId ?? undefined });

  const pick = useCallback((f: File | null) => {
    setFile(f);
    setFileError(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      pick(e.dataTransfer.files?.[0] ?? null);
    },
    [pick],
  );

  const submit = (values: DocumentUploadValues) => {
    if (!file) {
      setFileError("File wajib dipilih");
      return;
    }
    onSubmit(values, file);
  };

  const isImage = file?.type.startsWith("image/");

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-sm">
          File <span className="text-destructive">*</span>
        </Label>

        {file ? (
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            {isImage ? (
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="size-12 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="grid size-12 shrink-0 place-items-center rounded bg-muted text-muted-foreground">
                <FileText className="size-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{fmtSize(file.size)}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => pick(null)} aria-label="Hapus file">
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center text-sm transition-colors hover:bg-muted/50",
              dragOver && "border-primary bg-primary/5",
            )}
          >
            <UploadCloud className={cn("size-7 text-muted-foreground", dragOver && "text-primary")} />
            <span className="font-medium">Tarik & lepas file di sini</span>
            <span className="text-xs text-muted-foreground">atau klik untuk memilih (PDF, gambar, dokumen Office)</span>
            <input
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
        {fileError && <p className="text-xs text-destructive">{fileError}</p>}
      </div>

      <SelectField
        control={control}
        name="category"
        label="Kategori"
        required
        options={documentCategoryOptions}
      />
      <TextField control={control} name="documentName" label="Nama Dokumen" placeholder="Opsional — default nama file" />

      {!lockLocationId && (
        <SelectField
          control={control}
          name="locationId"
          label="Gardu"
          placeholder="Pilih gardu (opsional)"
          options={locationOptions}
        />
      )}
      <SelectField control={control} name="assetId" label="Aset" placeholder="Pilih aset (opsional)" options={assetOptions} />
      {!lockLocationId && (
        <p className="text-xs text-muted-foreground">Pilih minimal salah satu: Gardu atau Aset.</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Batal
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          Unggah
        </Button>
      </div>
    </form>
  );
}
