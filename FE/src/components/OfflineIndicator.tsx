import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { CloudOff, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useOfflineQueueCount, useFailedSyncCount } from "@/hooks/useOfflineQueueCount";
import { useSyncState } from "@/hooks/useSyncState";
import { initSyncManager, syncNow } from "@/lib/offline/syncManager";

/**
 * Global connectivity + sync affordance:
 *  - boots the sync manager once (auto-sync on reconnect, backoff retries),
 *  - shows an offline banner when there is no connection,
 *  - shows a "menyinkronkan…" pill while reports are pending/syncing,
 *  - shows a "sync gagal" pill linking to the Sync Center when items need help,
 *  - surfaces a toast summarising each completed sync.
 */
export function OfflineIndicator() {
  const online = useOnlineStatus();
  const pending = useOfflineQueueCount();
  const failed = useFailedSyncCount();
  const sync = useSyncState();
  const lastNotified = useRef<string | undefined>(undefined);

  // Boot the orchestrator exactly once.
  useEffect(() => {
    initSyncManager();
  }, []);

  // Surface a toast when a sync run finishes (deduped by lastSyncAt).
  useEffect(() => {
    if (!sync.lastResult || sync.lastSyncAt === lastNotified.current) return;
    lastNotified.current = sync.lastSyncAt;
    const r = sync.lastResult;
    if (r.synced > 0) {
      toast.success(`${r.synced} data offline berhasil dikirim`, {
        description: "Termasuk lampiran foto yang tersimpan.",
      });
    }
    if (r.conflicts > 0) {
      toast.warning(`${r.conflicts} data terdeteksi konflik`, {
        description: "Buka Sinkronisasi untuk meninjau.",
      });
    }
    if (r.failed > 0) {
      toast.error(`${r.failed} data gagal dikirim`, {
        description: "Buka Sinkronisasi untuk mencoba lagi.",
      });
    }
  }, [sync.lastResult, sync.lastSyncAt]);

  if (!online) {
    return (
      <div className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-amber-500 px-4 pt-safe py-1.5 text-center text-xs font-medium text-amber-950">
        <CloudOff className="size-3.5" />
        Mode offline — data akan disimpan dan dikirim otomatis saat online
        {pending > 0 ? ` (${pending} menunggu)` : ""}
      </div>
    );
  }

  if (sync.status === "syncing" || pending > 0) {
    return (
      <button
        type="button"
        onClick={() => void syncNow({ manual: true })}
        className="fixed bottom-[calc(4.5rem+var(--safe-bottom))] left-4 z-[90] md:bottom-4 flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs shadow-md hover:bg-accent"
      >
        <RefreshCw
          className={
            sync.status === "syncing"
              ? "size-3.5 animate-spin text-primary"
              : "size-3.5 text-primary"
          }
        />
        {sync.status === "syncing" ? "Menyinkronkan…" : `Menyinkronkan ${pending} data…`}
      </button>
    );
  }

  if (failed > 0) {
    return (
      <Link
        to={"/sync" as never}
        className="fixed bottom-[calc(4.5rem+var(--safe-bottom))] left-4 z-[90] md:bottom-4 flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive shadow-md hover:bg-destructive/20"
      >
        <AlertTriangle className="size-3.5" />
        {failed} data perlu perhatian
      </Link>
    );
  }

  // Brief success affordance right after a clean sync.
  if (sync.status === "idle" && sync.lastResult && sync.lastResult.synced > 0) {
    return (
      <div className="pointer-events-none fixed bottom-4 left-4 z-[90] flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400 shadow-md opacity-0 animate-in fade-in">
        <CheckCircle2 className="size-3.5" />
        Tersinkron
      </div>
    );
  }

  return null;
}
