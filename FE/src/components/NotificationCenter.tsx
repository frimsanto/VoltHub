import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Check,
  CheckCheck,
  ClipboardList,
  FileUp,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Ticket as TicketIcon,
  Archive,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  useNotifications,
  useUnreadCount,
  useMarkAllRead,
  useMarkRead,
  type AppNotification,
  type NotificationType,
} from "@/features/v2/notifications/api";
import { resolveNotificationLink } from "@/features/v2/notifications/links";

/** Icon + accent colour per trigger event. */
const TYPE_ICON: Record<NotificationType, ReactNode> = {
  TASK_ASSIGNED: <ClipboardList className="size-4 text-indigo-500" />,
  REPORT_SUBMITTED: <FileUp className="size-4 text-blue-500" />,
  REPORT_APPROVED: <CheckCircle2 className="size-4 text-green-500" />,
  REPORT_REJECTED: <XCircle className="size-4 text-red-500" />,
  REVISION_REQUESTED: <RotateCcw className="size-4 text-amber-500" />,
  TICKET_CREATED: <TicketIcon className="size-4 text-cyan-500" />,
  TICKET_CLOSED: <Archive className="size-4 text-violet-500" />,
};

function formatTime(dateString: string): string {
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

/**
 * Notification Center — a slide-over drawer (Sheet) showing the user's
 * server-backed notifications, with an unread counter on the bell, per-item
 * mark-as-read on click (and deep-link navigation), and a "mark all read"
 * action. Drop-in replacement for the legacy local-only NotificationDropdown.
 */
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Poll the badge always; only fetch the (heavier) feed while the drawer is open.
  const { data: unread = 0 } = useUnreadCount();
  const { data, isLoading } = useNotifications({ enabled: open, limit: 30 });
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const notifications = data?.items ?? [];

  const handleClick = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    const path = resolveNotificationLink(n);
    if (path) {
      setOpen(false);
      navigate({ to: path });
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi"}
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 size-5 flex items-center justify-center p-0 text-xs"
            >
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="flex-row items-center justify-between space-y-0 border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2">
            Notifikasi
            {unread > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unread} baru
              </Badge>
            )}
          </SheetTitle>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="size-3.5" />
              Tandai semua dibaca
            </Button>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Memuat…
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
              <Bell className="mb-3 size-8 text-slate-400" />
              <p className="text-sm font-medium">Tidak ada notifikasi</p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                      !n.readAt && "bg-blue-50/60 dark:bg-blue-950/20",
                    )}
                  >
                    <span className="mt-0.5 shrink-0">
                      {TYPE_ICON[n.type] ?? <Bell className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{n.title}</span>
                        {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-blue-500" />}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                        {n.body}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatTime(n.createdAt)}
                      </span>
                    </span>
                    {!n.readAt && (
                      <span
                        role="button"
                        tabIndex={-1}
                        aria-label="Tandai dibaca"
                        className="mt-0.5 rounded p-1 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          markRead.mutate(n.id);
                        }}
                      >
                        <Check className="size-3.5" />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
