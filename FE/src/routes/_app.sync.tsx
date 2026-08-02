import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  RefreshCw,
  CloudOff,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  RotateCcw,
  Inbox,
} from "lucide-react";
import { requireAuth } from "@/lib/route-guards";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/v2/PageHeader";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSyncState, useOfflineQueue } from "@/hooks/useSyncState";
import { useQueueCounts } from "@/hooks/useOfflineQueueCount";
import { retryItem, retryAllFailed, type QueuedReport } from "@/lib/offline/queue";
import { syncNow } from "@/lib/offline/syncManager";
import { discardQueueItem } from "@/lib/offline/sync";

export const Route = createFileRoute("/_app/sync")({
  beforeLoad: () => requireAuth(),
  component: SyncCenterPage,
  head: () => ({ meta: [{ title: "Sinkronisasi — VoltHub" }] }),
});

const KIND_LABEL: Record<QueuedReport["kind"], string> = {
  "laporan-awal": "Laporan Awal",
  "laporan-akhir": "Laporan Akhir",
  inspection: "Inspeksi",
  "inspeksi-gi": "Laporan GI",
  "har-gi": "Laporan HAR GI",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function SyncCenterPage() {
  const online = useOnlineStatus();
  const sync = useSyncState();
  const items = useOfflineQueue();
  const counts = useQueueCounts();
  const [busy, setBusy] = useState(false);

  const needsAttention = items.filter((i) => i.status === "failed" || i.status === "conflict");
  const inFlight = items.filter((i) => i.status === "pending" || i.status === "syncing");

  const handleSyncAll = async () => {
    setBusy(true);
    try {
      retryAllFailed();
      await syncNow({ manual: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sinkronisasi"
        description="Data yang dibuat saat offline tersimpan aman di perangkat dan dikirim otomatis saat online."
        actions={
          <Button onClick={handleSyncAll} disabled={!online || busy || counts.total === 0}>
            <RefreshCw
              className={busy || sync.status === "syncing" ? "size-4 animate-spin" : "size-4"}
            />
            Sinkron sekarang
          </Button>
        }
      />

      {/* Connectivity + summary banner */}
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <div className="flex items-center gap-2 text-sm">
          {online ? (
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <CloudOff className="size-4 text-amber-500" />
          )}
          <span className="font-medium">{online ? "Online" : "Offline"}</span>
        </div>
        <Stat label="Menunggu" value={counts.pending + counts.syncing} />
        <Stat label="Gagal" value={counts.failed} tone={counts.failed ? "danger" : undefined} />
        <Stat
          label="Konflik"
          value={counts.conflict}
          tone={counts.conflict ? "danger" : undefined}
        />
        {sync.lastSyncAt && (
          <div className="ml-auto text-xs text-muted-foreground">
            Sinkron terakhir: {fmt(sync.lastSyncAt)}
          </div>
        )}
      </Card>

      {counts.total === 0 && (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Inbox className="size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">Semua data sudah tersinkron</p>
          <p className="text-xs text-muted-foreground">
            Tidak ada antrean offline yang menunggu dikirim.
          </p>
        </Card>
      )}

      {/* Needs attention (failed / conflict) */}
      {needsAttention.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            <h2 className="text-sm font-semibold">Perlu perhatian ({needsAttention.length})</h2>
          </div>
          <div className="space-y-2">
            {needsAttention.map((item) => (
              <QueueRow key={item.id} item={item} online={online} attention />
            ))}
          </div>
        </section>
      )}

      {/* In-flight (pending / syncing) */}
      {inFlight.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Dalam antrean ({inFlight.length})</h2>
          <div className="space-y-2">
            {inFlight.map((item) => (
              <QueueRow key={item.id} item={item} online={online} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className={tone === "danger" ? "font-semibold text-destructive" : "font-semibold"}>
        {value}
      </span>
    </div>
  );
}

function QueueRow({
  item,
  online,
  attention,
}: {
  item: QueuedReport;
  online: boolean;
  attention?: boolean;
}) {
  const [working, setWorking] = useState(false);

  const onRetry = async () => {
    setWorking(true);
    try {
      retryItem(item.id);
      await syncNow({ manual: true });
    } finally {
      setWorking(false);
    }
  };

  const onDiscard = async () => {
    if (!window.confirm("Hapus data ini dari antrean? Tindakan ini tidak dapat dibatalkan."))
      return;
    setWorking(true);
    try {
      await discardQueueItem(item.id);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{KIND_LABEL[item.kind]}</span>
          <SyncStatusBadge status={item.status} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {item.label ? `${item.label} · ` : ""}Dibuat {fmt(item.createdAt)}
          {item.attempts > 0 ? ` · ${item.attempts}× percobaan` : ""}
        </p>
        {item.lastError && (
          <p className="mt-0.5 truncate text-xs text-destructive" title={item.lastError}>
            {item.lastError}
          </p>
        )}
      </div>

      {attention ? (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onRetry} disabled={!online || working}>
            <RotateCcw className={working ? "size-3.5 animate-spin" : "size-3.5"} />
            Coba lagi
          </Button>
          <Button size="sm" variant="ghost" onClick={onDiscard} disabled={working}>
            <Trash2 className="size-3.5" />
            Hapus
          </Button>
        </div>
      ) : (
        item.status === "pending" && (
          <span className="text-xs text-muted-foreground">Menunggu koneksi…</span>
        )
      )}
    </Card>
  );
}
