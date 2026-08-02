import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition, WO_TRANSITIONS } from './work-order.transitions';

describe('Work Order state machine — happy path', () => {
  it('walks the full corrective/preventive lifecycle', () => {
    expect(canTransition('DRAFT', 'ASSIGNED')).toBe(true);
    expect(canTransition('ASSIGNED', 'ON_PROGRESS')).toBe(true);
    expect(canTransition('ON_PROGRESS', 'WAITING_APPROVAL')).toBe(true);
    expect(canTransition('WAITING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransition('APPROVED', 'CLOSED')).toBe(true);
  });

  it('allows a DRAFT with an assignee to start immediately', () => {
    expect(canTransition('DRAFT', 'ON_PROGRESS')).toBe(true);
  });

  it('allows waiting-approval WOs to be rejected', () => {
    expect(canTransition('WAITING_APPROVAL', 'REJECTED')).toBe(true);
  });

  it('allows an admin to reopen a closed WO', () => {
    expect(canTransition('CLOSED', 'ON_PROGRESS')).toBe(true);
  });

  it('treats a self-transition as a no-op (allowed)', () => {
    expect(canTransition('ON_PROGRESS', 'ON_PROGRESS')).toBe(true);
  });
});

describe('Work Order state machine — illegal transitions', () => {
  it('cannot skip from DRAFT straight to APPROVED or CLOSED', () => {
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransition('DRAFT', 'CLOSED')).toBe(false);
  });

  it('cannot approve without going through WAITING_APPROVAL', () => {
    expect(canTransition('ON_PROGRESS', 'APPROVED')).toBe(false);
  });

  it('a CLOSED WO cannot be approved or rejected again', () => {
    expect(canTransition('CLOSED', 'APPROVED')).toBe(false);
    expect(canTransition('CLOSED', 'REJECTED')).toBe(false);
  });

  it('REJECTED ("Tidak Sesuai") is terminal — cannot be reopened', () => {
    expect(canTransition('REJECTED', 'ON_PROGRESS')).toBe(false);
    expect(canTransition('REJECTED', 'ASSIGNED')).toBe(false);
    expect(WO_TRANSITIONS.REJECTED).toEqual([]);
  });

  it('assertTransition throws a BusinessRuleError on an illegal move', () => {
    expect(() => assertTransition('DRAFT', 'CLOSED')).toThrowError(/tidak diizinkan/);
  });

  it('assertTransition is silent on a legal move', () => {
    expect(() => assertTransition('APPROVED', 'CLOSED')).not.toThrow();
  });
});

describe('Work Order state machine — completeness', () => {
  it('defines an outgoing set for every status', () => {
    const statuses = Object.keys(WO_TRANSITIONS);
    expect(statuses).toEqual(
      expect.arrayContaining([
        'DRAFT',
        'ASSIGNED',
        'ON_PROGRESS',
        'WAITING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'CLOSED',
      ])
    );
  });
});
