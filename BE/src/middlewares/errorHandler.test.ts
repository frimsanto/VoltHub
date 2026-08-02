import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { errorHandler, notFoundHandler, CustomError } from './errorHandler';
import { mockResponse } from '../__tests__/helpers/http';
import type { Request, NextFunction } from 'express';

const run = (err: CustomError) => {
  const res = mockResponse();
  errorHandler(err, {} as Request, res, (() => {}) as NextFunction);
  return res;
};

describe('errorHandler', () => {
  it('defaults to 500 for an unknown error', () => {
    const res = run(new Error('boom'));
    expect(res._status).toBe(500);
  });

  it('honors a custom statusCode', () => {
    const e = new Error('nope') as CustomError;
    e.statusCode = 418;
    expect(run(e)._status).toBe(418);
  });

  it('maps Prisma P2002 -> 409 conflict', () => {
    const e = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: '5',
    });
    expect(run(e as unknown as CustomError)._status).toBe(409);
  });

  it('maps Prisma P2025 -> 404 not found', () => {
    const e = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: '5',
    });
    expect(run(e as unknown as CustomError)._status).toBe(404);
  });

  it('maps Prisma P2003 -> 400 FK constraint', () => {
    const e = new Prisma.PrismaClientKnownRequestError('fk', {
      code: 'P2003',
      clientVersion: '5',
    });
    expect(run(e as unknown as CustomError)._status).toBe(400);
  });

  it('maps JWT errors -> 401', () => {
    const e = new Error('jwt') as CustomError;
    e.name = 'JsonWebTokenError';
    expect(run(e)._status).toBe(401);
  });

  it('maps TokenExpiredError -> 401', () => {
    const e = new Error('exp') as CustomError;
    e.name = 'TokenExpiredError';
    expect(run(e)._status).toBe(401);
  });

  it('maps ZodError -> 422', () => {
    const e = new Error('zod') as CustomError;
    e.name = 'ZodError';
    expect(run(e)._status).toBe(422);
  });
});

describe('notFoundHandler', () => {
  it('returns 404 for an unknown route', () => {
    const res = mockResponse();
    notFoundHandler({ originalUrl: '/api/nope' } as Request, res);
    expect(res._status).toBe(404);
  });
});
