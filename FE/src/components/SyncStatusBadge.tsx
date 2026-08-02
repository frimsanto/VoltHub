import { Badge } from "@/components/ui/badge";
import { Clock, RefreshCw, AlertTriangle, GitMerge } from "lucide-react";
import type { QueueItemStatus } from "@/lib/offline/queue";

const MAP: Record<
  QueueItemStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  pending: { label: "Menunggu", variant: "secondary", icon: Clock },
  syncing: { label: "Menyinkronkan", variant: "default", icon: RefreshCw },
  failed: { label: "Gagal", variant: "destructive", icon: AlertTriangle },
  conflict: { label: "Konflik", variant: "destructive", icon: GitMerge },
};

/** Small status chip for a queued offline item. */
export function SyncStatusBadge({ status }: { status: QueueItemStatus }) {
  const { label, variant, icon: Icon } = MAP[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className={status === "syncing" ? "size-3 animate-spin" : "size-3"} />
      {label}
    </Badge>
  );
}
