// VoltHub — Approval Workflow resource (API + TanStack Query hooks).
//
// Backend: BE/src/modules/workflow (mounted at /api/v1/workflow). The workflow is
// generic over (entityType, entityId), so any report/inspection/HAR/ticket can be
// driven through the same approval lifecycle.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { v2Get, v2Post, handleError } from "@/lib/api/v2";
import type { WorkflowAction, WorkflowState } from "@/lib/v2/workflow";

export interface UserRef {
  id: string;
  name: string;
  email?: string;
  role?: string | null;
}

export interface WorkflowInstance {
  id: string;
  entityType: string;
  entityId: string;
  currentState: WorkflowState;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTransition {
  id: string;
  instanceId: string;
  entityType: string;
  entityId: string;
  action: WorkflowAction;
  fromState: WorkflowState | null;
  toState: WorkflowState;
  performedBy: string | null;
  performedByRole: string | null;
  comment: string | null;
  reason: string | null;
  performedAt: string;
  performer?: UserRef | null;
}

export interface AvailableAction {
  action: WorkflowAction;
  label: string;
  to: WorkflowState;
  reasonRequired: boolean;
}

export interface WorkflowStatus {
  instance: WorkflowInstance;
  currentState: WorkflowState;
  isTerminal: boolean;
  availableActions: AvailableAction[];
  history: WorkflowTransition[];
}

export interface PerformActionBody {
  action: WorkflowAction;
  comment?: string | null;
  reason?: string | null;
}

const basePath = (entityType: string, entityId: string) =>
  `/workflow/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;

const keys = {
  status: (entityType: string, entityId: string) =>
    ["v2-workflow", entityType, entityId] as const,
};

/** Current state + available actions for the caller + full transition history. */
export function useWorkflowStatus(
  entityType: string | undefined,
  entityId: string | undefined,
  opts?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: keys.status(entityType ?? "—", entityId ?? "—"),
    queryFn: () => v2Get<WorkflowStatus>(basePath(entityType as string, entityId as string)),
    enabled: !!entityType && !!entityId && (opts?.enabled ?? true),
  });
}

/** Perform a workflow action (submit / review / approve / reject / …). */
export function useWorkflowTransition(entityType: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PerformActionBody) =>
      v2Post<{ toState: WorkflowState }, PerformActionBody>(
        `${basePath(entityType, entityId)}/transition`,
        body,
      ),
    onSuccess: (res) => {
      toast.success(`Status diperbarui: ${res.toState}`);
      qc.invalidateQueries({ queryKey: keys.status(entityType, entityId) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
