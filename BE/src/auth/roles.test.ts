import { describe, it, expect } from 'vitest';
import { canManageUsers, canManageTargetRole, hasGlobalScope } from './roles';

describe('canManageUsers — who may touch user accounts', () => {
  it('allows MASTER and ADMIN', () => {
    expect(canManageUsers('MASTER')).toBe(true);
    expect(canManageUsers('ADMIN')).toBe(true);
  });

  it('denies read-only MANAGER (no write anywhere, user accounts included)', () => {
    expect(canManageUsers('MANAGER')).toBe(false);
  });

  it('folds legacy roles (SUPERADMIN→MASTER, ADMIN_RTUPP→ADMIN)', () => {
    expect(canManageUsers('SUPERADMIN')).toBe(true);
    expect(canManageUsers('ADMIN_RTUPP')).toBe(true);
  });

  it('denies PETUGAS and unknown/empty roles', () => {
    expect(canManageUsers('PETUGAS')).toBe(false);
    expect(canManageUsers('USER')).toBe(false); // legacy → PETUGAS
    expect(canManageUsers(undefined)).toBe(false);
    expect(canManageUsers('NONSENSE')).toBe(false);
  });
});

describe('canManageTargetRole — which target an operator may act on', () => {
  it('MASTER may manage any target role', () => {
    for (const target of ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS']) {
      expect(canManageTargetRole('MASTER', target)).toBe(true);
    }
  });

  it('MANAGER may manage nobody (read-only role)', () => {
    for (const target of ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS']) {
      expect(canManageTargetRole('MANAGER', target)).toBe(false);
    }
  });

  it('ADMIN may manage only PETUGAS', () => {
    expect(canManageTargetRole('ADMIN', 'PETUGAS')).toBe(true);
    expect(canManageTargetRole('ADMIN', 'ADMIN')).toBe(false);
    expect(canManageTargetRole('ADMIN', 'MANAGER')).toBe(false);
    expect(canManageTargetRole('ADMIN', 'MASTER')).toBe(false);
  });

  it('PETUGAS may manage nobody', () => {
    expect(canManageTargetRole('PETUGAS', 'PETUGAS')).toBe(false);
  });
});

describe('hasGlobalScope — RTUPP visibility (role + rtuppId)', () => {
  it('MASTER is always global, even with an rtuppId set', () => {
    expect(hasGlobalScope('MASTER')).toBe(true);
    expect(hasGlobalScope('MASTER', 'rtupp-1')).toBe(true);
  });

  it('MANAGER without rtuppId (Manager UP3) is global', () => {
    expect(hasGlobalScope('MANAGER')).toBe(true);
    expect(hasGlobalScope('MANAGER', null)).toBe(true);
  });

  it('MANAGER with rtuppId (ASMEN) is scoped, NOT global', () => {
    expect(hasGlobalScope('MANAGER', 'rtupp-1')).toBe(false);
  });

  it('ADMIN is always global (2026-07 data-access policy), even with an rtuppId set', () => {
    expect(hasGlobalScope('ADMIN')).toBe(true);
    expect(hasGlobalScope('ADMIN', 'rtupp-1')).toBe(true);
    expect(hasGlobalScope('ADMIN_RTUPP', 'rtupp-1')).toBe(true); // legacy alias folds into ADMIN
  });

  it('PETUGAS and NOC are never global via this predicate', () => {
    expect(hasGlobalScope('PETUGAS')).toBe(false);
    expect(hasGlobalScope('PETUGAS', 'rtupp-1')).toBe(false);
    expect(hasGlobalScope('NOC')).toBe(false);
  });
});
