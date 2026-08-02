// VoltHub — badge status & pembanding untuk Laporan GI (Inspeksi/HAR).
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  GI_REPORT_STATUS_LABELS,
  GI_COMPARISON_LABELS,
  type GiReportStatus,
  type GiComparison,
} from "@/lib/v2/enums";

const STATUS_STYLES: Record<GiReportStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground border-transparent",
  SUBMITTED: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  VALIDATED: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
  REJECTED: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
};

export function GiStatusBadge({ status }: { status?: GiReportStatus | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge className={cn("font-medium", STATUS_STYLES[status])}>{GI_REPORT_STATUS_LABELS[status]}</Badge>;
}

const CMP_STYLES: Record<GiComparison, string> = {
  BELUM_DIBANDING: "bg-muted text-muted-foreground border-transparent",
  SESUAI: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
  TIDAK_SESUAI: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
};

export function GiComparisonBadge({ value }: { value?: GiComparison }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <Badge className={cn("font-medium", CMP_STYLES[value])}>{GI_COMPARISON_LABELS[value]}</Badge>;
}
