/**
 * Per-account login lockout (brute-force protection).
 *
 * Policy: after MAX_ATTEMPTS (5) consecutive failed logins for an account, the
 * account is locked for LOCK_MS (15 minutes). A successful login or the expiry
 * of the lock window clears the counter.
 *
 * Storage is in-memory (Map) by design — no schema change, works immediately,
 * and is sufficient for a single-instance deployment. For a multi-instance /
 * HA setup, swap the Map for a shared store (Redis) behind this same API.
 * This is layered UNDER the IP-based authLimiter (rateLimit.ts), which is the
 * outer defence that also covers unknown emails.
 */
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000; // 15 minutes
// Stale failure counters are forgotten after this idle period so a few
// scattered typos over days don't eventually lock a legitimate user.
const ATTEMPT_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface Entry {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number | null;
}

const store = new Map<string, Entry>();

const normalize = (key: string): string => key.trim().toLowerCase();

const now = () => Date.now();

/** Returns lock state for an account key (e.g. email). */
export const getLockStatus = (
  key: string
): { locked: boolean; retryAfterMs: number; attemptsRemaining: number } => {
  const entry = store.get(normalize(key));
  if (!entry) {
    return { locked: false, retryAfterMs: 0, attemptsRemaining: MAX_ATTEMPTS };
  }

  if (entry.lockedUntil && entry.lockedUntil > now()) {
    return {
      locked: true,
      retryAfterMs: entry.lockedUntil - now(),
      attemptsRemaining: 0,
    };
  }

  // Lock expired — reset on read.
  if (entry.lockedUntil && entry.lockedUntil <= now()) {
    store.delete(normalize(key));
    return { locked: false, retryAfterMs: 0, attemptsRemaining: MAX_ATTEMPTS };
  }

  return {
    locked: false,
    retryAfterMs: 0,
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - entry.failures),
  };
};

/**
 * Record a failed login. Returns the resulting lock state. Locks the account
 * once MAX_ATTEMPTS is reached.
 */
export const recordFailedAttempt = (
  key: string
): { locked: boolean; retryAfterMs: number; attemptsRemaining: number } => {
  const k = normalize(key);
  const t = now();
  let entry = store.get(k);

  // Start fresh if there's no entry or the window has gone stale.
  if (!entry || t - entry.firstFailureAt > ATTEMPT_TTL_MS) {
    entry = { failures: 0, firstFailureAt: t, lockedUntil: null };
  }

  entry.failures += 1;
  if (entry.failures >= MAX_ATTEMPTS) {
    entry.lockedUntil = t + LOCK_MS;
  }
  store.set(k, entry);

  if (entry.lockedUntil) {
    return { locked: true, retryAfterMs: entry.lockedUntil - t, attemptsRemaining: 0 };
  }
  return {
    locked: false,
    retryAfterMs: 0,
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - entry.failures),
  };
};

/** Clear all failure state for an account (call on successful login). */
export const clearAttempts = (key: string): void => {
  store.delete(normalize(key));
};

/** Test helper: wipe the whole store. */
export const _resetLockoutStore = (): void => {
  store.clear();
};
