/**
 * Enterprise Approval Workflow — state machine definition (single source of truth).
 *
 * Pure, side-effect-free data + helpers. The service, the transition guards and
 * the generated API docs all derive their behaviour from the tables here, so the
 * lifecycle is described in exactly one place.
 *
 * Lifecycle:
 *
 *   DRAFT ──submit──▶ SUBMITTED ──review──▶ REVIEWED ──approve──▶ APPROVED ──close──▶ CLOSED
 *                         │                     │                     │                  ▲
 *                         │ request_revision    │ request_revision    │ reject           │
 *                         ▼                     ▼                     ▼                  │
 *                   REVISION_REQUIRED ◀─────────┘                 REJECTED ──────────────┘
 *                         │                                          (close)
 *                         └──submit (resubmit)──▶ SUBMITTED
 *
 * Actors (enterprise roles) and their mapping to the canonical 3-role auth set
 * (src/auth/roles.ts) live in `ACTOR_CANONICAL_ROLES`. The deployed auth system
 * only issues SUPER_ADMIN / ADMIN / PETUGAS; the four enterprise actors are a
 * documentation/permission layer resolved from those canonical roles so the
 * feature works end-to-end today while modelling the org's approval hierarchy.
 */

import { normalizeRole, type CanonicalRole } from '../../auth/roles';

export const WORKFLOW_STATES = [
  'DRAFT',
  'SUBMITTED',
  'REVIEWED',
  'REVISION_REQUIRED',
  'APPROVED',
  'REJECTED',
  'CLOSED',
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const WORKFLOW_ACTIONS = [
  'SUBMIT',
  'REVIEW',
  'REQUEST_REVISION',
  'APPROVE',
  'REJECT',
  'CLOSE',
] as const;
export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

/** Enterprise approval actors (the org hierarchy modelled by the workflow). */
export const WORKFLOW_ACTORS = ['PETUGAS', 'SUPERVISOR', 'ADMIN_UP3', 'MANAGER'] as const;
export type WorkflowActor = (typeof WORKFLOW_ACTORS)[number];

/** States from which no further transition is possible. */
export const TERMINAL_STATES: readonly WorkflowState[] = ['CLOSED'];

export interface TransitionDef {
  action: WorkflowAction;
  /** States this action may be invoked from. */
  from: readonly WorkflowState[];
  to: WorkflowState;
  /** Enterprise actors permitted to perform the action. */
  actors: readonly WorkflowActor[];
  /** A free-text reason is mandatory (rejection / revision request). */
  reasonRequired?: boolean;
  label: string;
}

/**
 * The transition table. Order matters only for documentation; lookups are by
 * (action, fromState). A single action may originate from several states
 * (e.g. SUBMIT covers the initial submit and the post-revision resubmit).
 */
export const TRANSITIONS: readonly TransitionDef[] = [
  {
    action: 'SUBMIT',
    from: ['DRAFT', 'REVISION_REQUIRED'],
    to: 'SUBMITTED',
    actors: ['PETUGAS'],
    label: 'Ajukan laporan',
  },
  {
    action: 'REVIEW',
    from: ['SUBMITTED'],
    to: 'REVIEWED',
    actors: ['SUPERVISOR'],
    label: 'Tinjau (review)',
  },
  {
    action: 'REQUEST_REVISION',
    from: ['SUBMITTED', 'REVIEWED'],
    to: 'REVISION_REQUIRED',
    actors: ['SUPERVISOR', 'ADMIN_UP3'],
    reasonRequired: true,
    label: 'Minta revisi',
  },
  {
    action: 'APPROVE',
    from: ['REVIEWED'],
    to: 'APPROVED',
    actors: ['ADMIN_UP3', 'MANAGER'],
    label: 'Setujui',
  },
  {
    action: 'REJECT',
    from: ['SUBMITTED', 'REVIEWED'],
    to: 'REJECTED',
    actors: ['ADMIN_UP3', 'MANAGER'],
    reasonRequired: true,
    label: 'Tolak',
  },
  {
    action: 'CLOSE',
    from: ['APPROVED', 'REJECTED'],
    to: 'CLOSED',
    actors: ['ADMIN_UP3', 'MANAGER'],
    label: 'Tutup (arsipkan)',
  },
];

/**
 * Enterprise actor → canonical auth roles able to act as that actor.
 *
 * MASTER can act as every reviewer actor (global override). ADMIN covers the
 * SUPERVISOR / ADMIN_UP3 / MANAGER reviewer tier (the deployed auth model has a
 * single admin approval tier). PETUGAS is the field author. NOTE: the read-only
 * auth MANAGER role is deliberately NOT listed — approval stays with ADMIN/MASTER
 * and the monitoring role may never act as a reviewer. When the org later splits
 * ADMIN into distinct reviewer roles, only this map changes.
 */
export const ACTOR_CANONICAL_ROLES: Record<WorkflowActor, readonly CanonicalRole[]> = {
  PETUGAS: ['PETUGAS', 'ADMIN', 'MASTER'],
  SUPERVISOR: ['ADMIN', 'MASTER'],
  ADMIN_UP3: ['ADMIN', 'MASTER'],
  MANAGER: ['ADMIN', 'MASTER'],
};

/** The enterprise actors a given canonical auth role may act as. */
export const actorsForRole = (role?: string | null): WorkflowActor[] => {
  const canonical = normalizeRole(role);
  if (!canonical) return [];
  return WORKFLOW_ACTORS.filter((actor) => ACTOR_CANONICAL_ROLES[actor].includes(canonical));
};

/** Find the transition definition for an action invoked from a given state. */
export const findTransition = (
  action: WorkflowAction,
  fromState: WorkflowState
): TransitionDef | undefined =>
  TRANSITIONS.find((t) => t.action === action && t.from.includes(fromState));

/** Every action available from a state (ignoring actor permissions). */
export const actionsFromState = (state: WorkflowState): TransitionDef[] =>
  TRANSITIONS.filter((t) => t.from.includes(state));

/**
 * Actions a specific canonical auth role may perform from a state — the data the
 * UI needs to render only the buttons a user is actually allowed to click.
 */
export const allowedActionsFor = (state: WorkflowState, role?: string | null): TransitionDef[] => {
  const actors = actorsForRole(role);
  return actionsFromState(state).filter((t) => t.actors.some((a) => actors.includes(a)));
};

export const isTerminal = (state: WorkflowState): boolean => TERMINAL_STATES.includes(state);

export const isWorkflowState = (value: unknown): value is WorkflowState =>
  typeof value === 'string' && (WORKFLOW_STATES as readonly string[]).includes(value);
