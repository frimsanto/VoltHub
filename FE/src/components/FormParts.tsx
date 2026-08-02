import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  UploadCloud,
  X,
  Image as ImageIcon,
  CheckCircle2,
  Save,
  Send,
  FileText,
  Loader2,
  Camera as CameraIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { showSuccess, showError, showWarning } from "@/lib/swal";
import { ImagePreviewModal } from "@/components/ImagePreviewModal";
import { capturePhotoFile, isNativeCamera } from "@/lib/native/camera";

export function Section({
  title,
  description,
  children,
  idx,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  idx: number;
}) {
  return (
    <Card className="rounded-2xl shadow-soft border-border/60">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg gradient-pln text-white flex items-center justify-center text-sm font-bold">
            {idx}
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</CardContent>
    </Card>
  );
}

export function Field({
  label,
  children,
  required,
  full,
  error,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  full?: boolean;
  error?: string;
}) {
  return (
    <div className={cn("space-y-1.5", full && "md:col-span-2")}>
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p data-testid="field-error" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

type UploadFileItem = {
  name: string;
  size: number;
  url: string;
  type: string;
  file: File; // Keep original file for upload
  progress?: number; // Upload progress percentage
  status?: "pending" | "uploading" | "success" | "error";
  error?: string;
};

// All-in-One Upload Zone for Documentation
// Supports: Images (jpg, jpeg, png, webp) + Videos (mp4, mov, avi)
// No file count limit, supports 40+ files
export function UploadZone({
  label,
  multiple = true,
  accept = "image/jpeg,image/png,image/webp,image/jpg,video/mp4,video/quicktime,video/avi,video/x-msvideo",
  allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
    "video/mp4",
    "video/quicktime",
    "video/avi",
    "video/x-msvideo",
  ],
  maxFileSizeMb = 50, // Increased to 50MB for videos
  helperText,
  onFilesSelected, // Callback when files are selected
  testId, // Stable hook for E2E (applied to the hidden file <input>)
}: {
  label: string;
  multiple?: boolean;
  accept?: string;
  allowedMimeTypes?: string[];
  maxFileSizeMb?: number;
  helperText?: string;
  onFilesSelected?: (files: File[]) => void;
  testId?: string;
}) {
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    name: string;
    downloadUrl?: string;
  } | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  function isAllowedType(file: File): boolean {
    if (!allowedMimeTypes || allowedMimeTypes.length === 0) return true;
    return allowedMimeTypes.includes(file.type);
  }

  function isAllowedSize(file: File): boolean {
    const maxBytes = maxFileSizeMb * 1024 * 1024;
    return file.size <= maxBytes;
  }

  function formatFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / 1024).toFixed(1) + " KB";
  }

  function onFiles(fl: FileList | null) {
    if (!fl) return;
    addFiles(Array.from(fl));
  }

  function addFiles(incoming: File[]) {
    if (incoming.length === 0) return;
    const rejected: string[] = [];

    const accepted = incoming.filter((f) => {
      const okType = isAllowedType(f);
      const okSize = isAllowedSize(f);
      if (!okType) rejected.push(`${f.name} (tipe tidak didukung)`);
      else if (!okSize) rejected.push(`${f.name} (maks ${maxFileSizeMb} MB)`);
      return okType && okSize;
    });

    if (accepted.length === 0) {
      showError("Upload ditolak", rejected[0] ?? "File tidak valid");
      return;
    }

    const mapped: UploadFileItem[] = accepted.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
      url: URL.createObjectURL(f),
      file: f, // Keep original file
      progress: 0,
      status: "pending",
    }));

    setFiles((prev) => {
      const next = multiple ? [...prev, ...mapped] : mapped;
      return next;
    });

    // Notify parent component
    if (onFilesSelected) {
      onFilesSelected(accepted);
    }

    if (rejected.length > 0) {
      showWarning("Sebagian file ditolak", rejected.slice(0, 3).join("; "));
    }
    showSuccess(`${mapped.length} file ditambahkan`, `Total: ${files.length + mapped.length} file`);
  }

  async function handleCameraCapture() {
    try {
      const photo = await capturePhotoFile();
      if (photo) addFiles([photo]);
    } catch (err) {
      showError("Kamera gagal", err instanceof Error ? err.message : "Tidak dapat mengambil foto");
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const file = prev[index];
      if (file?.url) URL.revokeObjectURL(file.url);
      const next = prev.filter((_, idx) => idx !== index);
      if (onFilesSelected) {
        onFilesSelected(next.map((f) => f.file));
      }
      return next;
    });
  }

  function updateFileProgress(
    index: number,
    progress: number,
    status?: UploadFileItem["status"],
    error?: string,
  ) {
    setFiles((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index].progress = progress;
        if (status) next[index].status = status;
        if (error) next[index].error = error;
      }
      return next;
    });
  }

  // Expose updateFileProgress via ref or callback if needed for parent component
  // For now, this is a placeholder for future integration

  const imageCount = files.filter((f) => f.type.startsWith("image/")).length;
  const videoCount = files.filter((f) => f.type.startsWith("video/")).length;

  return (
    <div className="md:col-span-2 space-y-3">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">
        {label}
      </Label>

      {/* Upload Area */}
      <div
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          onFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-2xl border-2 border-dashed transition cursor-pointer p-6 text-center",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/30 hover:bg-muted/50 hover:border-primary/40",
        )}
      >
        <UploadCloud className="size-10 text-muted-foreground mx-auto mb-2" />
        <div className="text-sm font-semibold">Klik atau drag file ke sini</div>
        <div className="text-xs text-muted-foreground mt-1">
          {helperText || "Foto: JPG, PNG, WEBP • Video: MP4, MOV, AVI"}
        </div>
        <div className="text-xs text-muted-foreground">
          Maks {maxFileSizeMb} MB per file • Banyak file diperbolehkan
        </div>
        <input
          ref={ref}
          type="file"
          data-testid={testId}
          multiple={multiple}
          accept={accept}
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {/* Native camera shortcut (Capacitor app only; on web the file input
          already opens the camera on mobile via the accept attribute) */}
      {isNativeCamera() && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleCameraCapture}
        >
          <CameraIcon className="mr-2 size-4" /> Ambil Foto dengan Kamera
        </Button>
      )}

      {/* File Summary */}
      {files.length > 0 && (
        <div className="bg-muted/30 rounded-xl p-3 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">{files.length} file dipilih</span>
            <span className="text-xs text-muted-foreground">
              {imageCount > 0 && `${imageCount} foto`}
              {imageCount > 0 && videoCount > 0 && " • "}
              {videoCount > 0 && `${videoCount} video`}
            </span>
          </div>

          {/* File List */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {files.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border/50 group"
              >
                {/* Thumbnail / Icon */}
                <div
                  className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition"
                  onClick={() =>
                    f.type.startsWith("image/") && setPreviewImage({ url: f.url, name: f.name })
                  }
                >
                  {f.type.startsWith("image/") ? (
                    <img
                      src={f.url}
                      alt={f.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : f.type.startsWith("video/") ? (
                    <div className="text-[10px] text-muted-foreground font-medium">VIDEO</div>
                  ) : (
                    <ImageIcon className="size-4 text-muted-foreground" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{f.name}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                    {f.status === "uploading" && (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        <span>Uploading {f.progress}%</span>
                      </>
                    )}
                    {f.status === "success" && <span className="text-success">Uploaded</span>}
                    {f.status === "error" && (
                      <span className="text-destructive">{f.error || "Failed"}</span>
                    )}
                    {f.status === "pending" && <span>{formatFileSize(f.size)}</span>}
                  </div>
                  {/* Progress Bar */}
                  {f.status === "uploading" && (
                    <div className="w-full h-1 bg-muted rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Remove Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  className="size-6 rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <ImagePreviewModal
          open={!!previewImage}
          onClose={() => setPreviewImage(null)}
          imageUrl={previewImage.url}
          fileName={previewImage.name}
        />
      )}
    </div>
  );
}

export function FormToolbar({
  onWa,
  onSubmit,
  isSubmitting,
  submitTestId, // Stable hook for E2E (applied to the primary submit button)
}: {
  onWa?: () => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  submitTestId?: string;
}) {
  return (
    <div className="sticky bottom-4 z-10 mt-6">
      <div className="glass rounded-2xl border border-border/60 shadow-soft p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" />
          {isSubmitting ? "Menyimpan..." : "Autosaved 12 detik lalu • Draft tersimpan otomatis"}
        </div>
        <div className="flex items-center gap-2">
          {onWa && (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={onWa}
              disabled={isSubmitting}
            >
              <FileText className="size-4 mr-2" /> Preview WA
            </Button>
          )}
          <Button type="button" variant="outline" className="rounded-xl" disabled={isSubmitting}>
            <Save className="size-4 mr-2" /> Simpan Draft
          </Button>
          <Button
            type={onSubmit ? "button" : "submit"}
            data-testid={submitTestId}
            className="group rounded-xl gradient-pln text-white transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] shadow-lg hover:shadow-xl disabled:opacity-70 disabled:hover:scale-100"
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Send className="size-4 mr-2 transition-transform duration-300 group-hover:translate-x-1" />
                Submit Laporan
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export { Input, Textarea };
