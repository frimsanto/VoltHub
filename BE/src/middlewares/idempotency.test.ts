import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';
import { idempotency } from './idempotency';
import type { AuthRequest } from './auth';
import { mockResponse, mockNext } from '../__tests__/helpers/http';

vi.mock('../config/database');
import prisma, { resetPrismaMock } from '../config/database';

// Typed view of the mocked idempotencyKey model.
const idem = (prisma as any).idempotencyKey as {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const P2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

function makeReq(headerKey?: string): AuthRequest {
  return {
    method: 'POST',
    baseUrl: '/api/laporan-awal',
    path: '/',
    user: { userId: 'user-1' },
    header: (name: string) =>
      name.toLowerCase() === 'x-idempotency-key' ? headerKey : undefined,
  } as unknown as AuthRequest;
}

/** Flush queued microtasks so async .catch()/.then() chains settle. */
const flush = () => new Promise((r) => setImmediate(r));

describe('idempotency middleware', () => {
  beforeEach(() => resetPrismaMock());

  it('passes through when no X-Idempotency-Key header is present', async () => {
    const req = makeReq(undefined);
    const res = mockResponse();
    const next = mockNext();

    await idempotency(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(idem.create).not.toHaveBeenCalled();
  });

  it('reserves the key, runs the handler, and stores the success response', async () => {
    idem.create.mockResolvedValue({});
    idem.update.mockResolvedValue({});

    const req = makeReq('key-abc');
    const res = mockResponse();
    const next = mockNext();

    await idempotency(req, res, next);

    // Key reserved before the handler runs.
    expect(idem.create).toHaveBeenCalledWith({
      data: { key: 'key-abc', userId: 'user-1', scope: 'POST /api/laporan-awal', status: 'IN_PROGRESS' },
    });
    expect(next).toHaveBeenCalledOnce();

    // Simulate the create handler responding 201, then the response finishing.
    // (real Express sets res.statusCode via res.status(); the mock tracks _status)
    (res as any).statusCode = 201;
    res.status(201).json({ success: true, data: { id: 'la-1' } });
    res.end();
    await flush();

    expect(idem.update).toHaveBeenCalledWith({
      where: { key: 'key-abc' },
      data: {
        status: 'COMPLETED',
        statusCode: 201,
        responseBody: JSON.stringify({ success: true, data: { id: 'la-1' } }),
      },
    });
  });

  it('replays the stored response for a duplicate key (no handler run, no duplicate)', async () => {
    idem.create.mockRejectedValue(P2002);
    idem.findUnique.mockResolvedValue({
      key: 'key-abc',
      status: 'COMPLETED',
      statusCode: 201,
      responseBody: JSON.stringify({ success: true, data: { id: 'la-1' } }),
    });

    const req = makeReq('key-abc');
    const res = mockResponse();
    const next = mockNext();

    await idempotency(req, res, next);

    // Handler is NEVER invoked again — the duplicate cannot create a record.
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(201);
    expect(res._json).toEqual({ success: true, data: { id: 'la-1' } });
  });

  it('rejects a concurrent in-flight duplicate with 409', async () => {
    idem.create.mockRejectedValue(P2002);
    idem.findUnique.mockResolvedValue({ key: 'key-abc', status: 'IN_PROGRESS', responseBody: null });

    const req = makeReq('key-abc');
    const res = mockResponse();
    const next = mockNext();

    await idempotency(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(409);
    expect((res._json as any).error).toBe('IDEMPOTENT_REPLAY_IN_PROGRESS');
  });

  it('releases the key on a failed response so the client can retry', async () => {
    idem.create.mockResolvedValue({});
    idem.delete.mockResolvedValue({});

    const req = makeReq('key-abc');
    const res = mockResponse();
    const next = mockNext();

    await idempotency(req, res, next);
    expect(next).toHaveBeenCalledOnce();

    // Handler errors out → 500.
    (res as any).statusCode = 500;
    res.status(500).json({ success: false, message: 'boom' });
    res.end();
    await flush();

    expect(idem.delete).toHaveBeenCalledWith({ where: { key: 'key-abc' } });
    expect(idem.update).not.toHaveBeenCalled();
  });

  it('fails open (calls next) when the reserve hits an unexpected DB error', async () => {
    idem.create.mockRejectedValue(new Error('table missing'));

    const req = makeReq('key-abc');
    const res = mockResponse();
    const next = mockNext();

    await idempotency(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
