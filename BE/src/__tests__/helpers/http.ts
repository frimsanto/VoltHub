import { vi } from 'vitest';
import { PassThrough } from 'stream';
import type { Response } from 'express';

/**
 * A minimal Express Response double that records status + json/send payloads.
 * Backed by a real `PassThrough` stream so libraries that pipe to the response
 * (e.g. ExcelJS `workbook.xlsx.write(res)`) have a working writable interface.
 */
export interface MockResponse extends Response {
  _status: number;
  _json: unknown;
  _headers: Record<string, string>;
  _ended: boolean;
}

export const mockResponse = (): MockResponse => {
  // PassThrough provides write/end/on/once/emit so stream consumers work.
  const stream = new PassThrough();
  // Drain so writes never buffer indefinitely during tests.
  stream.resume();
  const res = stream as unknown as MockResponse;
  res._status = 200;
  res._json = undefined;
  res._headers = {};
  res._ended = false;

  res.status = vi.fn((code: number) => {
    res._status = code;
    return res;
  }) as unknown as Response['status'];

  res.json = vi.fn((body: unknown) => {
    res._json = body;
    return res;
  }) as unknown as Response['json'];

  res.send = vi.fn((body: unknown) => {
    res._json = body;
    return res;
  }) as unknown as Response['send'];

  res.setHeader = vi.fn((k: string, v: string) => {
    res._headers[k] = v;
    return res;
  }) as unknown as Response['setHeader'];

  // Preserve PassThrough.end (so the stream finishes) while recording the flag.
  const realEnd = stream.end.bind(stream);
  res.end = vi.fn((...args: unknown[]) => {
    res._ended = true;
    return realEnd(...(args as []));
  }) as unknown as Response['end'];

  return res;
};

/** A `next` spy for middleware tests. */
export const mockNext = () => vi.fn();
