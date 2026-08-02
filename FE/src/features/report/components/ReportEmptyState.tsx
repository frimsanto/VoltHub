import { FileX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Empty state standar untuk daftar laporan.
 * Markup identik dengan blok empty-state yang sebelumnya diduplikasi di Monitoring & Validasi.
 * `className` dipakai untuk override padding/grid (mis. "py-8", "col-span-full py-8").
 */
export function ReportEmptyState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <FileX className="size-12 text-muted-foreground mb-3" />
      <div className="text-sm font-medium">{title}</div>
      {description && <div className="text-xs text-muted-foreground mt-1">{description}</div>}
    </div>
  );
}
