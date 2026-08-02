// VoltHub — Approval Workflow status badge.
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATE_LABELS, STATE_STYLES, type WorkflowState } from "@/lib/v2/workflow";

export function WorkflowStatusBadge({
  state,
  className,
}: {
  state?: WorkflowState | null;
  className?: string;
}) {
  if (!state) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge className={cn("font-medium", STATE_STYLES[state], className)}>
      {STATE_LABELS[state]}
    </Badge>
  );
}
