import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { useNotificationStore, type Notification } from "@/stores/notification";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function NotificationDropdown() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } =
    useNotificationStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const getNotificationIcon = (notification: Notification) => {
    switch (notification.type) {
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
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    setOpen(false);

    if (notification.reportId && notification.reportType) {
      // Jenis tak dikenal diarahkan ke History sebagai fallback aman.
      const routeMap: Record<string, string> = {
        AWAL: "/laporan-awal",
        AKHIR: "/laporan-akhir",
      };
      const base = routeMap[notification.reportType];
      if (base) {
        navigate({ to: `${base}/${notification.reportId}` });
      } else {
        navigate({ to: "/history" });
      }
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Baru saja";
    if (diffMins < 60) return `${diffMins} menit lalu`;
    if (diffHours < 24) return `${diffHours} jam lalu`;
    if (diffDays < 7) return `${diffDays} hari lalu`;
    return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="notif-bell"
          aria-label={unreadCount > 0 ? `Notifikasi, ${unreadCount} belum dibaca` : "Notifikasi"}
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 size-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-slate-900 dark:text-white">Notifikasi</h3>

          {notifications.length > 0 && (
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Tandai semua dibaca
                </button>
              )}

              <button
                onClick={clearAll}
                className="text-xs font-medium text-red-500 hover:text-red-600"
              >
                Hapus semua
              </button>
            </div>
          )}
        </div>

        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
              <Bell className="mb-3 h-8 w-8 text-slate-400" />
              <p className="text-sm font-medium">Tidak ada notifikasi</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="flex flex-col items-start p-3 gap-2 cursor-pointer"
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-2 w-full">
                  {getNotificationIcon(notification)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{notification.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">
                        {formatTime(notification.createdAt)}
                      </span>
                      <div className="flex items-center gap-1">
                        {!notification.read && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                            Baru
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
