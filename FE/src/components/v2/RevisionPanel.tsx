// VoltHub — Revision Panel: author-facing surface when a report needs revision.
//
// Surfaces the reviewer's most recent revision/rejection reason and lets the
// author (PETUGAS) resubmit (SUBMIT from REVISION_REQUIRED) once the report has
// been corrected. Renders nothing when the workflow is not awaiting a revision,
// so it can be dropped unconditionally onto a report detail page.
import { Loader2, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useWorkflowStatus,
  useWorkflowTransition,
} from "@/features/v2/workflow/resource";

function latestReason(
  history: { reason: string | null; action: string; performedAt: string }[],
): string | null {
  const withReason = history
    .filter((h) => h.reason && (h.action === "REQUEST_REVISION" || h.action === "REJECT"))
    .sort((a, b) => +new Date(b.performedAt) - +new Date(a.performedAt));
  return withReason[0]?.reason ?? null;
}

export function RevisionPanel({
  entityType,
  entityId,
  className,
}: {
  entityType: string;
  entityId: string;
  className?: string;
}) {
  const { data, isLoading } = useWorkflowStatus(entityType, entityId);
  const mutation = useWorkflowTransition(entityType, entityId);

  if (isLoading || !data) return null;
  if (data.currentState !== "REVISION_REQUIRED") return null;

  const canResubmit = data.availableActions.some((a) => a.action === "SUBMIT");
  const reason = latestReason(data.history);

  return (
    <Card className={className}>
      <CardHeader className="space-y-0">
        <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4" /> Perlu Revisi
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Catatan dari peninjau
          </p>
          <p className="mt-1 text-sm">{reason ?? "Tidak ada catatan khusus."}</p>
        </div>
        {canResubmit ? (
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ action: "SUBMIT" })}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            Ajukan Ulang
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Perbaiki laporan, lalu ajukan ulang dari akun pembuat laporan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
