// VoltHub — Notifications bottom sheet (mobile)
// First-class notifications surface for the mobile bottom-nav "Notifikasi" tab.
// Reuses the existing notification store (stores/notification) — no new route,
// no new logic — and presents the full list in a native-style bottom sheet with
// safe-area padding. The desktop/tablet experience keeps the topbar dropdown
// (NotificationDropdown); this is the touch-first equivalent.

import { useNavigate } from "@tanstack/react-router";
import { Bell, FileText, CheckCircle, XCircle, Clock, CheckCheck, Trash2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useNotificationStore, type Notification } from "@/stores/notification";
import { cn } from "@/lib/utils";

function iconFor(n: Notification) {
  switch (n.type) {
    case "report_created":
      return <FileText className="size-4 text-blue-500" />;
    case "report_approved":
      return <CheckCircle className="size-4 text-green-500" />;
    case "report_rejected":
      return <XCircle className="size-4 text-red-500" />;
    case "report_updated":
      return <Clock className="size-4 text-orange-500" />;
    default:
      return <Bell className="size-4" />;
  }
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  if (hours < 24) return `${hours} jam lalu`;
  if (days < 7) return `${days} hari lalu`;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function NotificationsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } =
    useNotificationStore();
  const navigate = useNavigate();

  const handleClick = (n: Notification) => {
    markAsRead(n.id);
    onOpenChange(false);
    if (n.reportId && n.reportType) {
      const base =
        n.reportType === "AWAL"
          ? "/laporan-awal"
          : n.reportType === "AKHIR"
            ? "/laporan-akhir"
            : null;
      navigate({ to: base ? (`${base}/${n.reportId}` as never) : "/history" });
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] pb-safe">
        <DrawerHeader className="flex flex-row items-center justify-between text-left">
          <DrawerTitle className="flex items-center gap-2">
            Notifikasi
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1.5">
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            )}
          </DrawerTitle>
          {notifications.length > 0 && (
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 text-xs font-medium text-primary"
                >
                  <CheckCheck className="size-3.5" /> Tandai dibaca
                </button>
              )}
              <button
                onClick={clearAll}
                className="flex items-center gap-1 text-xs font-medium text-destructive"
              >
                <Trash2 className="size-3.5" /> Hapus
              </button>
            </div>
          )}
        </DrawerHeader>

        <ScrollArea className="min-h-0 flex-1 px-2 pb-2">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
              <Bell className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">Tidak ada notifikasi</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors active:bg-muted",
                      !n.read && "bg-primary/5",
                    )}
                  >
                    <span className="mt-0.5 shrink-0">{iconFor(n)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{n.title}</span>
                        {!n.read && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                      </span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {n.message}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {formatTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
