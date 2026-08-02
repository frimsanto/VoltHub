import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getLockStatus,
  recordFailedAttempt,
  clearAttempts,
  _resetLockoutStore,
  MAX_ATTEMPTS,
  LOCK_MS,
} from './loginLockout';

beforeEach(() => _resetLockoutStore());
afterEach(() => vi.useRealTimers());

const KEY = 'user@pln.co.id';

describe('loginLockout', () => {
  it('is unlocked with full attempts initially', () => {
    const s = getLockStatus(KEY);
    expect(s.locked).toBe(false);
    expect(s.attemptsRemaining).toBe(MAX_ATTEMPTS);
  });

  it('decrements remaining attempts on each failure', () => {
    recordFailedAttempt(KEY);
    expect(getLockStatus(KEY).attemptsRemaining).toBe(MAX_ATTEMPTS - 1);
    recordFailedAttempt(KEY);
    expect(getLockStatus(KEY).attemptsRemaining).toBe(MAX_ATTEMPTS - 2);
  });

  it('locks the account after exactly 5 failed attempts', () => {
    let result;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      result = recordFailedAttempt(KEY);
    }
    expect(result!.locked).toBe(true);
    expect(getLockStatus(KEY).locked).toBe(true);
    expect(result!.retryAfterMs).toBeGreaterThan(0);
    expect(result!.retryAfterMs).toBeLessThanOrEqual(LOCK_MS);
  });

  it('stays locked for ~15 minutes, then unlocks', () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);
    for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailedAttempt(KEY);
    expect(getLockStatus(KEY).locked).toBe(true);

    // 14 minutes -> still locked
    vi.setSystemTime(start + 14 * 60 * 1000);
    expect(getLockStatus(KEY).locked).toBe(true);

    // 15 minutes + 1s -> unlocked
    vi.setSystemTime(start + LOCK_MS + 1000);
    expect(getLockStatus(KEY).locked).toBe(false);
  });

  it('clearAttempts resets the counter (successful login)', () => {
    recordFailedAttempt(KEY);
    recordFailedAttempt(KEY);
    clearAttempts(KEY);
    expect(getLockStatus(KEY).attemptsRemaining).toBe(MAX_ATTEMPTS);
  });

  it('is case-insensitive on the account key', () => {
    recordFailedAttempt('User@PLN.co.id');
    expect(getLockStatus('user@pln.co.id').attemptsRemaining).toBe(MAX_ATTEMPTS - 1);
  });

  it('locks accounts independently', () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailedAttempt('a@pln.id');
    expect(getLockStatus('a@pln.id').locked).toBe(true);
    expect(getLockStatus('b@pln.id').locked).toBe(false);
  });
});
