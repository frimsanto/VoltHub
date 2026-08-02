// VoltHub — Offline & error state views
// Mobile-first, touch-friendly fallbacks for the two failure modes a screen can
// hit: no connectivity, or a request that errored. Both mirror the EmptyState
// visual language (Card, centered, full-width action on phones) so loading →
// empty → offline → error feel like one family. They render presentation only;
// the retry handler is supplied by the caller (e.g. a React Query `refetch`).

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CloudOff, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

function Shell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("rounded-2xl border-border/60 shadow-soft", className)}>
      <CardContent className="flex flex-col items-center justify-center px-5 py-12 text-center sm:px-6 sm:py-16">
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Shown when a screen has no data because the device is offline. Surfaces the
 * count of edits waiting to sync (if any) so the user knows their work is safe.
 */
export function OfflineState({
  title = "Tidak ada koneksi",
  description = "Anda sedang offline. Sambungkan kembali untuk memuat data terbaru — perubahan Anda tetap tersimpan dan terkirim otomatis.",
  pendingCount,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  pendingCount?: number;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Shell className={className}>
      <div className="mb-4 rounded-full bg-amber-500/10 p-3 sm:p-4">
        <CloudOff className="size-12 text-amber-500 sm:size-16" />
      </div>
      <h3 className="mb-2 text-base font-semibold sm:text-lg">{title}</h3>
      <p className="mb-6 max-w-md text-sm text-muted-foreground">{description}</p>
      {pendingCount != null && pendingCount > 0 && (
        <p className="mb-6 -mt-3 text-xs font-medium text-amber-600 dark:text-amber-400">
          {pendingCount} data menunggu untuk dikirim
        </p>
      )}
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="w-full rounded-xl sm:w-auto">
          <RefreshCw className="mr-2 size-4" /> Coba lagi
        </Button>
      )}
    </Shell>
  );
}

/**
 * Generic error fallback with a retry affordance. Detects the offline case and
 * defers to OfflineState so the user gets the right message (and reassurance)
 * rather than a raw error when the real problem is connectivity.
 */
export function ErrorState({
  title = "Gagal memuat data",
  description,
  error,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const online = useOnlineStatus();
  if (!online) return <OfflineState onRetry={onRetry} className={className} />;

  const message =
    description ??
    (error instanceof Error && error.message
      ? error.message
      : "Terjadi kesalahan saat mengambil data. Silakan coba lagi.");

  return (
    <Shell className={className}>
      <div className="mb-4 rounded-full bg-destructive/10 p-3 sm:p-4">
        <AlertTriangle className="size-12 text-destructive sm:size-16" />
      </div>
      <h3 className="mb-2 text-base font-semibold sm:text-lg">{title}</h3>
      <p className="mb-6 max-w-md break-words text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} className="w-full rounded-xl gradient-pln text-white sm:w-auto">
          <RefreshCw className="mr-2 size-4" /> Coba lagi
        </Button>
      )}
    </Shell>
  );
}
