import { describe, it, expect } from 'vitest';
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  validationErrorResponse,
} from './response';
import { mockResponse } from '../__tests__/helpers/http';

describe('response helpers', () => {
  it('successResponse wraps data with success:true', () => {
    const res = mockResponse();
    successResponse(res, { a: 1 }, 'ok');
    expect(res._status).toBe(200);
    expect((res._json as any).success).toBe(true);
    expect((res._json as any).data).toEqual({ a: 1 });
  });

  it('successResponse includes meta when provided', () => {
    const res = mockResponse();
    successResponse(res, [], 'ok', 200, { page: 1, total: 0 });
    expect((res._json as any).meta.page).toBe(1);
  });

  it('errorResponse sets success:false and status', () => {
    const res = mockResponse();
    errorResponse(res, 'bad', 400, { field: 'x' });
    expect(res._status).toBe(400);
    expect((res._json as any).success).toBe(false);
    expect((res._json as any).error).toEqual({ field: 'x' });
  });

  it('notFoundResponse -> 404', () => {
    const res = mockResponse();
    notFoundResponse(res);
    expect(res._status).toBe(404);
  });

  it('unauthorizedResponse -> 401', () => {
    const res = mockResponse();
    unauthorizedResponse(res);
    expect(res._status).toBe(401);
  });

  it('forbiddenResponse -> 403', () => {
    const res = mockResponse();
    forbiddenResponse(res);
    expect(res._status).toBe(403);
  });

  it('validationErrorResponse -> 422', () => {
    const res = mockResponse();
    validationErrorResponse(res, { email: 'invalid' });
    expect(res._status).toBe(422);
  });
});
