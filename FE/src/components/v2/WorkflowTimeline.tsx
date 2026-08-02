// VoltHub — Approval Workflow timeline (renders the immutable transition log).
import {
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Archive,
  Circle,
  Clock,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACTION_LABELS,
  STATE_LABELS,
  type WorkflowAction,
} from "@/lib/v2/workflow";
import type { WorkflowTransition } from "@/features/v2/workflow/resource";

const ACTION_ICON: Record<WorkflowAction, React.ReactNode> = {
  SUBMIT: <Send className="size-4 text-blue-500" />,
  REVIEW: <Eye className="size-4 text-cyan-500" />,
  REQUEST_REVISION: <RotateCcw className="size-4 text-amber-500" />,
  APPROVE: <CheckCircle2 className="size-4 text-green-500" />,
  REJECT: <XCircle className="size-4 text-red-500" />,
  CLOSE: <Archive className="size-4 text-violet-500" />,
};

function fmt(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ts
    : d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function WorkflowTimeline({
  transitions,
  className,
}: {
  transitions: WorkflowTransition[];
  className?: string;
}) {
  if (!transitions.length) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <Clock className="size-4" />
        Belum ada aktivitas workflow.
      </div>
    );
  }

  return (
    <ol className={cn("relative space-y-4 border-l border-border pl-6", className)}>
      {transitions.map((t) => (
        <li key={t.id} className="relative">
          <span className="absolute -left-[1.95rem] flex size-7 items-center justify-center rounded-full border bg-background">
            {ACTION_ICON[t.action] ?? <Circle className="size-4 text-muted-foreground" />}
          </span>
          <div className="rounded-lg border bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {ACTION_LABELS[t.action] ?? t.action}
                <span className="text-muted-foreground">
                  {" "}
                  · {t.fromState ? STATE_LABELS[t.fromState] : "—"} → {STATE_LABELS[t.toState]}
                </span>
              </p>
              <time className="text-xs text-muted-foreground">{fmt(t.performedAt)}</time>
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <User className="size-3" />
              {t.performer?.name ?? "Sistem"}
              {t.performedByRole ? ` (${t.performedByRole})` : ""}
            </div>
            {t.reason ? (
              <p className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                <span className="font-medium">Alasan:</span> {t.reason}
              </p>
            ) : null}
            {t.comment ? (
              <p className="mt-2 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                <span className="font-medium">Catatan:</span> {t.comment}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
