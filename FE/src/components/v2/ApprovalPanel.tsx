// VoltHub — Approval Panel: the reviewer's action surface for a workflow.
//
// Self-contained: fetches the workflow status for (entityType, entityId) and
// renders only the actions the current user is permitted to perform (the server
// returns `availableActions`; the UI mirror in lib/v2/workflow gates the same).
// Reason-required actions (Reject / Request Revision) reveal a mandatory note;
// other actions accept an optional comment. The backend guard is the enforcer.
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowStatusBadge } from "@/components/v2/WorkflowStatusBadge";
import { ACTION_LABELS, type WorkflowAction } from "@/lib/v2/workflow";
import {
  useWorkflowStatus,
  useWorkflowTransition,
  type AvailableAction,
} from "@/features/v2/workflow/resource";

/** Visual intent per action — destructive for reject, default otherwise. */
const ACTION_VARIANT: Partial<Record<WorkflowAction, "default" | "destructive" | "secondary" | "outline">> = {
  APPROVE: "default",
  SUBMIT: "default",
  REVIEW: "secondary",
  REQUEST_REVISION: "outline",
  REJECT: "destructive",
  CLOSE: "secondary",
};

export function ApprovalPanel({
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

  const [active, setActive] = useState<AvailableAction | null>(null);
  const [text, setText] = useState("");

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat status…
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const { currentState, availableActions, isTerminal } = data;

  const submit = () => {
    if (!active) return;
    const value = text.trim();
    if (active.reasonRequired && !value) return;
    mutation.mutate(
      active.reasonRequired
        ? { action: active.action, reason: value }
        : { action: active.action, comment: value || null },
      { onSuccess: () => { setActive(null); setText(""); } },
    );
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" /> Persetujuan
        </CardTitle>
        <WorkflowStatusBadge state={currentState} />
      </CardHeader>
      <CardContent className="space-y-3">
        {isTerminal ? (
          <p className="text-sm text-muted-foreground">
            Workflow telah selesai (status terminal). Tidak ada tindakan lebih lanjut.
          </p>
        ) : availableActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tidak ada tindakan yang tersedia untuk peran Anda pada status ini.
          </p>
        ) : !active ? (
          <div className="flex flex-wrap gap-2">
            {availableActions.map((a) => (
              <Button
                key={a.action}
                size="sm"
                variant={ACTION_VARIANT[a.action] ?? "default"}
                onClick={() => { setActive(a); setText(""); }}
              >
                {ACTION_LABELS[a.action] ?? a.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {ACTION_LABELS[active.action]} → {active.to}
            </p>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                active.reasonRequired
                  ? "Alasan wajib diisi…"
                  : "Catatan (opsional)…"
              }
              rows={3}
            />
            {active.reasonRequired && !text.trim() ? (
              <p className="text-xs text-destructive">Alasan wajib diisi.</p>
            ) : null}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={ACTION_VARIANT[active.action] ?? "default"}
                disabled={mutation.isPending || (active.reasonRequired && !text.trim())}
                onClick={submit}
              >
                {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Konfirmasi"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={mutation.isPending}
                onClick={() => { setActive(null); setText(""); }}
              >
                Batal
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
