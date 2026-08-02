import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Loading spinner standar untuk daftar laporan.
 * Markup identik dengan blok loading yang sebelumnya diduplikasi di History & Validasi.
 */
export function ReportLoading({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-12", className)}>
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}
