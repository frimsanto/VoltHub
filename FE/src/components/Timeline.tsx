import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User, CheckCircle, XCircle, Edit, FileText, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimelineEvent {
  id: string;
  type: "created" | "updated" | "submitted" | "approved" | "rejected" | "validated";
  timestamp: Date;
  user?: { name: string; email?: string };
  details?: string;
}

interface TimelineProps {
  events: TimelineEvent[];
  className?: string;
}

export function Timeline({ events, className }: TimelineProps) {
  const getEventIcon = (type: TimelineEvent["type"]) => {
    switch (type) {
      case "created":
        return <FileText className="size-4 text-blue-500" />;
      case "updated":
        return <Edit className="size-4 text-amber-500" />;
      case "submitted":
        return <Send className="size-4 text-purple-500" />;
      case "approved":
        return <CheckCircle className="size-4 text-green-500" />;
      case "rejected":
        return <XCircle className="size-4 text-red-500" />;
      case "validated":
        return <CheckCircle className="size-4 text-cyan-500" />;
      default:
        return <Clock className="size-4 text-muted-foreground" />;
    }
  };

  const getEventLabel = (type: TimelineEvent["type"]) => {
    switch (type) {
      case "created":
        return "Dibuat";
      case "updated":
        return "Diperbarui";
      case "submitted":
        return "Disubmit";
      case "approved":
        return "Disetujui";
      case "rejected":
        return "Ditolak";
      case "validated":
        return "Divalidasi";
      default:
        return type;
    }
  };

  const getEventBadgeVariant = (type: TimelineEvent["type"]) => {
    switch (type) {
      case "created":
        return "default" as const;
      case "updated":
        return "secondary" as const;
      case "submitted":
        return "outline" as const;
      case "approved":
        return "default" as const;
      case "rejected":
        return "destructive" as const;
      case "validated":
        return "default" as const;
      default:
        return "secondary" as const;
    }
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Baru saja";
    if (minutes < 60) return `${minutes} menit lalu`;
    if (hours < 24) return `${hours} jam lalu`;
    if (days < 7) return `${days} hari lalu`;

    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (events.length === 0) {
    return (
      <Card className={cn("rounded-2xl shadow-soft border-border/60", className)}>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Clock className="size-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Belum ada aktivitas</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("rounded-2xl shadow-soft border-border/60", className)}>
      <CardContent className="p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Clock className="size-4" />
          Timeline Aktivitas
        </h3>
        <div className="space-y-4">
          {events.map((event, index) => (
            <div key={event.id} className="flex gap-3 relative">
              {/* Timeline line */}
              {index !== events.length - 1 && (
                <div className="absolute left-[19px] top-8 bottom-0 w-px bg-border" />
              )}

              {/* Icon */}
              <div className="relative z-10 size-10 rounded-full bg-card border-2 border-border flex items-center justify-center shrink-0">
                {getEventIcon(event.type)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={getEventBadgeVariant(event.type)} className="text-xs">
                    {getEventLabel(event.type)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(event.timestamp)}
                  </span>
                </div>

                {event.user && (
                  <div className="flex items-center gap-2 text-sm mb-1">
                    <User className="size-3 text-muted-foreground" />
                    <span className="font-medium">{event.user.name}</span>
                    {event.user.email && (
                      <span className="text-muted-foreground text-xs">({event.user.email})</span>
                    )}
                  </div>
                )}

                {event.details && (
                  <p className="text-xs text-muted-foreground mt-1">{event.details}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
