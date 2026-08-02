// VoltHub — SCADA Upload (NOC): replace snapshot harian dari Siemens SP7.
//
// Dua section (RTU + Lines), masing-masing: drag & drop / browse file .xlsx,
// info snapshot terakhir, tombol "Upload & Replace" dengan progress bar, dan
// ringkasan hasil (UP/DOWN/matched) setelah sukses. Di bawahnya riwayat 30
// upload terakhir (dari audit trail — snapshot lama di-replace total).
import { useRef, useState } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  History,
  Loader2,
  CheckCircle2,
  X,
  RadioTower,
  Network,
} from "lucide-react";
import type { AxiosProgressEvent } from "axios";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/features/v2/dashboard/widgets";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  useScadaLatest,
  useScadaUpload,
  useScadaUploadHistory,
  formatUploadedAt,
  isSnapshotStale,
  type ScadaFileType,
} from "./api";

const SECTION_META: Record<
  ScadaFileType,
  { title: string; icon: typeof RadioTower; filePattern: string; description: string }
> = {
  RTU: {
    title: "RTU (Inscan/OOP Gardu)",
    icon: RadioTower,
    filePattern: "csd_IFS-IFS_RTUs*.xlsx",
    description: "Status setiap gardu — RTU Name + Oper State (UP = Inscan, DOWN = OOP).",
  },
  LINES: {
    title: "Lines (Channel IFS)",
    icon: Network,
    filePattern: "csd_IFS-IFS_Lines*.xlsx",
    description: "Status channel/koneksi IFS — Channel Id + Oper State per IFS server.",
  },
};

export function ScadaUploadPage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <UploadSection fileType="RTU" />
        <UploadSection fileType="LINES" />
      </div>
      <UploadHistory />
    </div>
  );
}

function UploadSection({ fileType }: { fileType: ScadaFileType }) {
  const meta = SECTION_META[fileType];
  const latest = useScadaLatest(fileType);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useScadaUpload((e: AxiosProgressEvent) => {
    if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
  });

  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) return; // .xlsx/.xls only — mirror backend filter
    setFile(f);
    upload.reset();
  };

  const doUpload = () => {
    if (!file || upload.isPending) return;
    setProgress(0);
    upload.mutate(
      { fileType, file },
      { onSuccess: () => setFile(null) },
    );
  };

  const s = latest.data;
  const summary = upload.data;

  return (
    <SectionCard title={meta.title} icon={meta.icon} testId={`scada-upload-${fileType}`}>
      <div className="space-y-4">
        {/* Snapshot terakhir */}
        {latest.isLoading ? (
          <Skeleton className="h-14 w-full" />
        ) : s ? (
          <div
            className={cn(
              "rounded-lg border px-4 py-3 text-sm",
              isSnapshotStale(s.uploadedAt)
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-border bg-muted/40",
            )}
          >
            <p className="text-muted-foreground">
              Snapshot terakhir:{" "}
              <span className="font-medium text-foreground">
                {formatUploadedAt(s.uploadedAt)}
              </span>{" "}
              oleh <span className="font-medium text-foreground">{s.uploader?.name ?? "—"}</span>
            </p>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
              <span>{s.totalRows} baris</span>
              <span className="text-green-600 dark:text-green-400">{s.totalUp} UP</span>
              <span className="text-red-600 dark:text-red-400">{s.totalDown} DOWN</span>
              {s.matched != null && (
                <span className="text-muted-foreground">{s.matched} match gardu</span>
              )}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Belum ada snapshot {fileType} — upload pertama akan membuatnya.
          </div>
        )}

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/40",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {file ? (
            <>
              <FileSpreadsheet className="size-8 text-primary" />
              <p className="max-w-full truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(0)} KB — siap diupload
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
              >
                <X className="size-4" /> Ganti file
              </Button>
            </>
          ) : (
            <>
              <UploadCloud className="size-8 text-muted-foreground/60" />
              <p className="text-sm font-medium">Drag & drop file di sini, atau klik untuk browse</p>
              <p className="text-xs text-muted-foreground">
                {meta.filePattern} · {meta.description}
              </p>
            </>
          )}
        </div>

        {/* Progress */}
        {upload.isPending && (
          <div className="space-y-1">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">
              {progress < 100 ? `Mengunggah… ${progress}%` : "Memproses file di server…"}
            </p>
          </div>
        )}

        {/* Ringkasan hasil upload terakhir di sesi ini */}
        {summary && !upload.isPending && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm tabular-nums">
            <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
            <span className="font-medium">{summary.totalRows} baris masuk</span>
            <span className="text-green-600 dark:text-green-400">{summary.totalUp} UP</span>
            <span className="text-red-600 dark:text-red-400">{summary.totalDown} DOWN</span>
            {summary.matched != null && <span>{summary.matched} match ke gardu</span>}
          </div>
        )}

        <Button className="w-full" disabled={!file || upload.isPending} onClick={doUpload}>
          {upload.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UploadCloud className="size-4" />
          )}
          Upload & Replace
        </Button>
        <p className="text-xs text-muted-foreground">
          Upload menggantikan seluruh snapshot {fileType} sebelumnya. Jika proses gagal, snapshot
          lama tetap utuh.
        </p>
      </div>
    </SectionCard>
  );
}

function UploadHistory() {
  const history = useScadaUploadHistory();
  return (
    <SectionCard title="Riwayat Upload (30 terakhir)" icon={History}>
      {history.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="max-h-80 overflow-auto" data-lenis-prevent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Uploader</TableHead>
                <TableHead className="text-right">Baris</TableHead>
                <TableHead className="text-right">UP</TableHead>
                <TableHead className="text-right">DOWN</TableHead>
                <TableHead className="text-right">Match</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(history.data ?? []).map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatUploadedAt(h.uploadedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{h.fileType ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {h.uploader?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{h.totalRows ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-green-600 dark:text-green-400">
                    {h.totalUp ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                    {h.totalDown ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {h.matched ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {(history.data?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Belum ada riwayat upload.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  );
}
