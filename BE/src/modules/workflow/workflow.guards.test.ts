import { describe, it, expect } from 'vitest';
import { evaluateTransition } from './workflow.guards';
import {
  TRANSITIONS,
  allowedActionsFor,
  actorsForRole,
  isTerminal,
} from './workflow.config';

describe('workflow state machine — actor mapping', () => {
  it('maps canonical roles to enterprise actors', () => {
    expect(actorsForRole('PETUGAS')).toEqual(['PETUGAS']);
    expect(actorsForRole('ADMIN')).toEqual(['PETUGAS', 'SUPERVISOR', 'ADMIN_UP3', 'MANAGER']);
    // legacy enum values normalise too
    expect(actorsForRole('SUPERADMIN')).toContain('MANAGER');
    expect(actorsForRole('ADMIN_RTUPP')).toContain('SUPERVISOR');
    expect(actorsForRole(undefined)).toEqual([]);
  });
});

describe('workflow guards — happy path', () => {
  it('allows PETUGAS to submit a DRAFT', () => {
    const r = evaluateTransition({ action: 'SUBMIT', fromState: 'DRAFT', role: 'PETUGAS' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.transition.to).toBe('SUBMITTED');
  });

  it('allows ADMIN (supervisor) to review then approve', () => {
    expect(evaluateTransition({ action: 'REVIEW', fromState: 'SUBMITTED', role: 'ADMIN' }).ok).toBe(true);
    expect(evaluateTransition({ action: 'APPROVE', fromState: 'REVIEWED', role: 'ADMIN' }).ok).toBe(true);
  });

  it('allows resubmit from REVISION_REQUIRED', () => {
    const r = evaluateTransition({ action: 'SUBMIT', fromState: 'REVISION_REQUIRED', role: 'PETUGAS' });
    expect(r.ok).toBe(true);
  });

  it('allows close from APPROVED and REJECTED', () => {
    expect(evaluateTransition({ action: 'CLOSE', fromState: 'APPROVED', role: 'ADMIN' }).ok).toBe(true);
    expect(evaluateTransition({ action: 'CLOSE', fromState: 'REJECTED', role: 'ADMIN' }).ok).toBe(true);
  });
});

describe('workflow guards — rejections', () => {
  it('rejects an invalid transition (approve from DRAFT)', () => {
    const r = evaluateTransition({ action: 'APPROVE', fromState: 'DRAFT', role: 'ADMIN' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_TRANSITION');
  });

  it('forbids PETUGAS from approving', () => {
    const r = evaluateTransition({ action: 'APPROVE', fromState: 'REVIEWED', role: 'PETUGAS' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FORBIDDEN_ROLE');
  });

  it('blocks any transition out of a terminal state', () => {
    const r = evaluateTransition({ action: 'SUBMIT', fromState: 'CLOSED', role: 'ADMIN' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('TERMINAL');
    expect(isTerminal('CLOSED')).toBe(true);
  });

  it('requires a reason for REJECT and REQUEST_REVISION', () => {
    const reject = evaluateTransition({ action: 'REJECT', fromState: 'REVIEWED', role: 'ADMIN' });
    expect(reject.ok).toBe(false);
    if (!reject.ok) expect(reject.code).toBe('REASON_REQUIRED');

    const ok = evaluateTransition({
      action: 'REJECT',
      fromState: 'REVIEWED',
      role: 'ADMIN',
      reason: 'Data tegangan tidak sesuai',
    });
    expect(ok.ok).toBe(true);
  });
});

describe('workflow — available actions for UI', () => {
  it('exposes only the actions a role may perform from a state', () => {
    const petugasDraft = allowedActionsFor('DRAFT', 'PETUGAS').map((t) => t.action);
    expect(petugasDraft).toEqual(['SUBMIT']);

    const adminSubmitted = allowedActionsFor('SUBMITTED', 'ADMIN').map((t) => t.action).sort();
    expect(adminSubmitted).toEqual(['REJECT', 'REQUEST_REVISION', 'REVIEW']);

    expect(allowedActionsFor('CLOSED', 'ADMIN')).toEqual([]);
  });
});

describe('workflow config — integrity', () => {
  it('every transition target is a known state and reachable definition', () => {
    for (const t of TRANSITIONS) {
      expect(t.from.length).toBeGreaterThan(0);
      expect(t.actors.length).toBeGreaterThan(0);
    }
  });
});
