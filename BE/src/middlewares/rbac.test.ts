import { describe, it, expect } from 'vitest';
import {
  authorize,
  requireReportWrite,
  requireOwnershipOrAdmin,
} from './rbac';
import { UserRole } from '@prisma/client';
import { AuthRequest } from './auth';
import { mockResponse, mockNext } from '../__tests__/helpers/http';

const reqWith = (role?: string, userId = 'owner-1') =>
  (role ? { user: { role, userId } } : {}) as AuthRequest;

describe('authorize', () => {
  it('403 when unauthenticated', () => {
    const res = mockResponse();
    const next = mockNext();
    authorize(UserRole.ADMIN_RTUPP)(reqWith(undefined), res, next);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a permitted role', () => {
    const res = mockResponse();
    const next = mockNext();
    authorize(UserRole.ADMIN_RTUPP, UserRole.SUPERADMIN)(reqWith('ADMIN_RTUPP'), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('blocks a non-permitted role (403)', () => {
    const res = mockResponse();
    const next = mockNext();
    authorize(UserRole.SUPERADMIN)(reqWith('PETUGAS'), res, next);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireReportWrite (canonical 3-role model)', () => {
  // Phase 2: ADMIN absorbs the deprecated ADMIN_RTUPP and is the own-RTUPP
  // manager (Permission Matrix: F own). It may therefore write reports.
  it('allows ADMIN to write reports', () => {
    const res = mockResponse();
    const next = mockNext();
    requireReportWrite(reqWith('ADMIN'), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('blocks MASTER (legacy SUPERADMIN) — pure system administrator, no operational writes', () => {
    const res = mockResponse();
    const next = mockNext();
    requireReportWrite(reqWith('SUPERADMIN'), res, next);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows PETUGAS to write reports', () => {
    const res = mockResponse();
    const next = mockNext();
    requireReportWrite(reqWith('PETUGAS'), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows ADMIN_RTUPP to write reports', () => {
    const res = mockResponse();
    const next = mockNext();
    requireReportWrite(reqWith('ADMIN_RTUPP'), res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('requireOwnershipOrAdmin', () => {
  it('lets ADMIN_RTUPP through regardless of owner', async () => {
    const res = mockResponse();
    const next = mockNext();
    await requireOwnershipOrAdmin(() => 'someone-else')(
      reqWith('ADMIN_RTUPP'),
      res,
      next
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('lets PETUGAS access their OWN resource', async () => {
    const res = mockResponse();
    const next = mockNext();
    await requireOwnershipOrAdmin(() => 'owner-1')(
      reqWith('PETUGAS', 'owner-1'),
      res,
      next
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('blocks PETUGAS from another user resource (403)', async () => {
    const res = mockResponse();
    const next = mockNext();
    await requireOwnershipOrAdmin(() => 'other-owner')(
      reqWith('PETUGAS', 'owner-1'),
      res,
      next
    );
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
