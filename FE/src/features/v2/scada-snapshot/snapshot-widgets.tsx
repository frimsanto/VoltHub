// VoltHub — shared building blocks for the SP7 snapshot dashboards
// (Inscan/OOP RTU + Lines): freshness banner, UP/DOWN badge, pager.
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, UploadCloud, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/v2/rbac";
import type { PageMeta } from "@/lib/api/v2";
import {
  formatUploadedAt,
  isSnapshotStale,
  type ScadaLatestSnapshot,
} from "./api";

/**
 * Freshness banner — "Data per [uploadedAt] — diupload oleh [uploader]".
 * Turns amber when the snapshot is older than 24h (stale warning: petugas
 * lapangan harus tahu kalau data belum diupdate hari ini).
 */
export function SnapshotBanner({ snapshot }: { snapshot: ScadaLatestSnapshot }) {
  const stale = isSnapshotStale(snapshot.uploadedAt);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2.5 text-sm",
        stale
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
      data-testid="scada-snapshot-banner"
    >
      {stale ? (
        <AlertTriangle className="size-4 shrink-0" />
      ) : (
        <Clock className="size-4 shrink-0" />
      )}
      <span>
        Data per <span className="font-medium">{formatUploadedAt(snapshot.uploadedAt)}</span> —
        diupload oleh <span className="font-medium">{snapshot.uploader?.name ?? "—"}</span>
      </span>
      {stale && (
        <span className="font-medium">
          · Data lebih dari 24 jam — minta tim NOC upload export terbaru.
        </span>
      )}
    </div>
  );
}

/** Empty state when no snapshot of a type has ever been uploaded. */
export function SnapshotEmptyState({ label }: { label: string }) {
  const canUpload = useCan("scada.upload");
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-14 text-center">
      <UploadCloud className="size-10 text-muted-foreground/50" />
      <div>
        <p className="font-medium">Belum ada snapshot {label}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Data muncul setelah tim NOC meng-upload file export Siemens SP7.
        </p>
      </div>
      {canUpload && (
        <Button asChild size="sm">
          <Link to={"/scada-upload" as never}>Upload sekarang</Link>
        </Button>
      )}
    </div>
  );
}

/** UP (Inscan) / DOWN (OOP) badge — green/red, other states neutral. */
export function OperStateBadge({ state }: { state: string | null | undefined }) {
  if (!state) return <span className="text-muted-foreground">—</span>;
  if (state === "UP") {
    return (
      <Badge className="border-transparent bg-green-500/15 text-green-700 dark:text-green-400">
        UP · Inscan
      </Badge>
    );
  }
  if (state === "DOWN") {
    return (
      <Badge className="border-transparent bg-red-500/15 text-red-700 dark:text-red-400">
        DOWN · OOP
      </Badge>
    );
  }
  return <Badge variant="secondary">{state}</Badge>;
}

/** Server-side pager: row-count summary + prev/next. */
export function SnapshotPager({
  meta,
  page,
  onPageChange,
  shown,
}: {
  meta: PageMeta | undefined;
  page: number;
  onPageChange: (page: number) => void;
  shown: number;
}) {
  const totalPages = meta?.totalPages ?? 0;
  if (!meta || totalPages <= 1) {
    return meta && meta.total > 0 ? (
      <p className="mt-3 text-xs text-muted-foreground">
        Menampilkan {shown} dari {meta.total} baris.
      </p>
    ) : null;
  }
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        Menampilkan {shown} dari {meta.total} baris.
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4" /> Sebelumnya
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">
          Hal {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Berikutnya <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
