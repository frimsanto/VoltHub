// VoltHub — Enterprise Approval Workflow (frontend mirror).
//
// MIRRORS the backend state machine (BE/src/modules/workflow/workflow.config.ts).
// It does NOT define authorization — the backend guard is the enforcer. This
// layer lets the UI render the correct status badge, timeline, and only the
// action buttons the current user is actually allowed to click (so they never
// fire a request that would 403/422).

import { toV2Role, type V2Role } from "@/lib/v2/rbac";

export const WORKFLOW_STATES = [
  "DRAFT",
  "SUBMITTED",
  "REVIEWED",
  "REVISION_REQUIRED",
  "APPROVED",
  "REJECTED",
  "CLOSED",
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const WORKFLOW_ACTIONS = [
  "SUBMIT",
  "REVIEW",
  "REQUEST_REVISION",
  "APPROVE",
  "REJECT",
  "CLOSE",
] as const;
export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

export const WORKFLOW_ACTORS = ["PETUGAS", "SUPERVISOR", "ADMIN_UP3", "MANAGER"] as const;
export type WorkflowActor = (typeof WORKFLOW_ACTORS)[number];

export const STATE_LABELS: Record<WorkflowState, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  REVIEWED: "Ditinjau",
  REVISION_REQUIRED: "Perlu Revisi",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CLOSED: "Ditutup",
};

export const ACTION_LABELS: Record<WorkflowAction, string> = {
  SUBMIT: "Ajukan",
  REVIEW: "Tinjau",
  REQUEST_REVISION: "Minta Revisi",
  APPROVE: "Setujui",
  REJECT: "Tolak",
  CLOSE: "Tutup",
};

/** Tailwind badge styles per state (matches the v2 StatusBadge palette). */
export const STATE_STYLES: Record<WorkflowState, string> = {
  DRAFT: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-transparent",
  SUBMITTED: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-transparent",
  REVIEWED: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-transparent",
  REVISION_REQUIRED: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  APPROVED: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
  REJECTED: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
  CLOSED: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-transparent",
};

export interface TransitionDef {
  action: WorkflowAction;
  from: readonly WorkflowState[];
  to: WorkflowState;
  actors: readonly WorkflowActor[];
  reasonRequired?: boolean;
  label: string;
}

/** Mirror of BE TRANSITIONS. */
export const TRANSITIONS: readonly TransitionDef[] = [
  { action: "SUBMIT", from: ["DRAFT", "REVISION_REQUIRED"], to: "SUBMITTED", actors: ["PETUGAS"], label: "Ajukan laporan" },
  { action: "REVIEW", from: ["SUBMITTED"], to: "REVIEWED", actors: ["SUPERVISOR"], label: "Tinjau (review)" },
  { action: "REQUEST_REVISION", from: ["SUBMITTED", "REVIEWED"], to: "REVISION_REQUIRED", actors: ["SUPERVISOR", "ADMIN_UP3"], reasonRequired: true, label: "Minta revisi" },
  { action: "APPROVE", from: ["REVIEWED"], to: "APPROVED", actors: ["ADMIN_UP3", "MANAGER"], label: "Setujui" },
  { action: "REJECT", from: ["SUBMITTED", "REVIEWED"], to: "REJECTED", actors: ["ADMIN_UP3", "MANAGER"], reasonRequired: true, label: "Tolak" },
  { action: "CLOSE", from: ["APPROVED", "REJECTED"], to: "CLOSED", actors: ["ADMIN_UP3", "MANAGER"], label: "Tutup (arsipkan)" },
];

export const TERMINAL_STATES: readonly WorkflowState[] = ["CLOSED"];
export const isTerminal = (s: WorkflowState): boolean => TERMINAL_STATES.includes(s);

/** Enterprise actor → V2 (canonical) roles able to act as that actor. */
// NOTE: the read-only auth MANAGER role is deliberately absent — approval stays
// with ADMIN/MASTER and the monitoring role may never act as a reviewer actor.
const ACTOR_V2_ROLES: Record<WorkflowActor, readonly V2Role[]> = {
  PETUGAS: ["PETUGAS", "ADMIN", "MASTER"],
  SUPERVISOR: ["ADMIN", "MASTER"],
  ADMIN_UP3: ["ADMIN", "MASTER"],
  MANAGER: ["ADMIN", "MASTER"],
};

export const actorsForRole = (role: string | null | undefined): WorkflowActor[] => {
  const v2 = toV2Role(role);
  return WORKFLOW_ACTORS.filter((a) => ACTOR_V2_ROLES[a].includes(v2));
};

/** Actions available from a state (ignoring role). */
export const actionsFromState = (state: WorkflowState): TransitionDef[] =>
  TRANSITIONS.filter((t) => t.from.includes(state));

/** Actions the given role may perform from a state — drives which buttons show. */
export const allowedActionsFor = (
  state: WorkflowState,
  role: string | null | undefined,
): TransitionDef[] => {
  const actors = actorsForRole(role);
  return actionsFromState(state).filter((t) => t.actors.some((a) => actors.includes(a)));
};

/** Ordered states for a stepper/progress display (branches excluded). */
export const HAPPY_PATH: readonly WorkflowState[] = [
  "DRAFT",
  "SUBMITTED",
  "REVIEWED",
  "APPROVED",
  "CLOSED",
];
