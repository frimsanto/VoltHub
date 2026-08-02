import { describe, it, expect } from 'vitest';
import { authenticate, optionalAuth, requireRole, AuthRequest } from './auth';
import { generateAccessToken } from '../utils/jwt';
import { mockResponse, mockNext } from '../__tests__/helpers/http';

const tokenFor = (role: string) =>
  generateAccessToken({ userId: 'u1', email: 'u@pln.id', role, name: 'U' });

describe('authenticate middleware', () => {
  it('rejects requests with no Authorization header (401)', () => {
    const req = { headers: {} } as AuthRequest;
    const res = mockResponse();
    const next = mockNext();
    authenticate(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects malformed Authorization header (401)', () => {
    const req = { headers: { authorization: 'Token abc' } } as AuthRequest;
    const res = mockResponse();
    const next = mockNext();
    authenticate(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an invalid token (401)', () => {
    const req = {
      headers: { authorization: 'Bearer garbage.token.here' },
    } as AuthRequest;
    const res = mockResponse();
    const next = mockNext();
    authenticate(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a valid token and populates req.user', () => {
    const req = {
      headers: { authorization: `Bearer ${tokenFor('ADMIN_RTUPP')}` },
    } as AuthRequest;
    const res = mockResponse();
    const next = mockNext();
    authenticate(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.role).toBe('ADMIN_RTUPP');
  });
});

describe('optionalAuth middleware', () => {
  it('continues without user when no header', () => {
    const req = { headers: {} } as AuthRequest;
    const res = mockResponse();
    const next = mockNext();
    optionalAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeUndefined();
  });

  it('continues silently on an invalid token', () => {
    const req = {
      headers: { authorization: 'Bearer bad' },
    } as AuthRequest;
    const res = mockResponse();
    const next = mockNext();
    optionalAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeUndefined();
  });
});

describe('requireRole middleware (RBAC matrix)', () => {
  const run = (userRole: string | undefined, allowed: string[]) => {
    const req = (userRole ? { user: { role: userRole } } : {}) as AuthRequest;
    const res = mockResponse();
    const next = mockNext();
    requireRole(allowed)(req, res, next);
    return { res, next };
  };

  it('401 when unauthenticated', () => {
    const { res, next } = run(undefined, ['ADMIN_RTUPP']);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('admin allowed on admin-only route', () => {
    const { next } = run('ADMIN_RTUPP', ['ADMIN_RTUPP', 'SUPERADMIN']);
    expect(next).toHaveBeenCalledOnce();
  });

  it('validator (ADMIN_RTUPP) allowed on validation route', () => {
    const { next } = run('ADMIN_RTUPP', ['ADMIN_RTUPP', 'SUPERADMIN']);
    expect(next).toHaveBeenCalledOnce();
  });

  it('user (PETUGAS) FORBIDDEN on admin-only route (403)', () => {
    const { res, next } = run('PETUGAS', ['ADMIN_RTUPP', 'SUPERADMIN']);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('user (PETUGAS) allowed on a petugas route', () => {
    const { next } = run('PETUGAS', ['PETUGAS', 'ADMIN_RTUPP', 'SUPERADMIN']);
    expect(next).toHaveBeenCalledOnce();
  });
});
