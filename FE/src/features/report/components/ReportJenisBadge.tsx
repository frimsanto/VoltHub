import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Badge jenis laporan (AWAL / AKHIR).
 * Markup identik dengan badge jenis yang sebelumnya ditulis inline di History & Validasi.
 */
export function ReportJenisBadge({ jenis, className }: { jenis: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("rounded-md", className)}>
      {jenis}
    </Badge>
  );
}
