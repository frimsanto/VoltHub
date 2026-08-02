/**
 * Transition guards — pure validation of a proposed state change.
 *
 * Separated from the service so the rules are independently testable and can be
 * reused (e.g. to pre-validate on the API edge). A guard answers a single
 * question: "may this user, in this role, perform this action on an entity that
 * is currently in `fromState`?" — and, if not, why.
 */

import {
  findTransition,
  actorsForRole,
  isTerminal,
  type WorkflowAction,
  type WorkflowState,
  type TransitionDef,
} from './workflow.config';

export interface GuardContext {
  action: WorkflowAction;
  fromState: WorkflowState;
  role?: string | null;
  reason?: string | null;
}

export type GuardResult =
  | { ok: true; transition: TransitionDef }
  | { ok: false; code: 'TERMINAL' | 'INVALID_TRANSITION' | 'FORBIDDEN_ROLE' | 'REASON_REQUIRED'; message: string };

export const evaluateTransition = (ctx: GuardContext): GuardResult => {
  const { action, fromState, role, reason } = ctx;

  if (isTerminal(fromState)) {
    return {
      ok: false,
      code: 'TERMINAL',
      message: `Workflow is in terminal state "${fromState}"; no further transitions are allowed.`,
    };
  }

  const transition = findTransition(action, fromState);
  if (!transition) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      message: `Action "${action}" is not valid from state "${fromState}".`,
    };
  }

  const actors = actorsForRole(role);
  const permitted = transition.actors.some((a) => actors.includes(a));
  if (!permitted) {
    return {
      ok: false,
      code: 'FORBIDDEN_ROLE',
      message: `Role "${role ?? 'unknown'}" may not perform "${action}". Allowed actors: ${transition.actors.join(', ')}.`,
    };
  }

  if (transition.reasonRequired && !reason?.trim()) {
    return {
      ok: false,
      code: 'REASON_REQUIRED',
      message: `Action "${action}" requires a reason.`,
    };
  }

  return { ok: true, transition };
};
