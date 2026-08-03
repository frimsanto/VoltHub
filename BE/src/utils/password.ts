/**
 * Password hashing (Argon2id) with transparent bcrypt migration.
 *
 * All new hashes are Argon2id — the current OWASP recommendation, and unlike
 * bcrypt it is memory-hard (GPU/ASIC cracking is far more expensive) and has no
 * 72-byte input truncation.
 *
 * Historical rows were hashed with bcryptjs, so `verifyPassword` accepts both
 * formats: it picks the algorithm from the stored hash's prefix and reports back
 * whether the caller should re-hash. Callers that have a DB handle (login,
 * change-password) persist the upgraded hash, so accounts move to Argon2id as
 * their owners log in — no forced password reset.
 *
 * Drop the bcryptjs branch once no `$2*$` hashes remain in the users table.
 */
import argon2 from 'argon2';
import bcrypt from 'bcryptjs';

/**
 * bcrypt's modular-crypt prefixes. bcryptjs emits `$2a$`; `$2b$`/`$2y$`/`$2x$`
 * come from other implementations and are matched so a hash imported from
 * elsewhere is still recognised as legacy rather than treated as corrupt.
 */
const BCRYPT_PREFIX = /^\$2[abxy]\$/;

/** True when the stored hash is bcrypt (i.e. predates the Argon2id migration). */
export const isLegacyHash = (hash: string): boolean => BCRYPT_PREFIX.test(hash);

/** Hashes a plaintext password with Argon2id using the library defaults. */
export const hashPassword = (plain: string): Promise<string> => argon2.hash(plain);

export interface PasswordVerification {
  /** Whether the supplied plaintext matches the stored hash. */
  valid: boolean;
  /**
   * Set only when `valid` is true and the stored hash is outdated — a bcrypt
   * hash, or an Argon2id hash made with weaker parameters than today's default.
   * Callers should re-hash the plaintext and persist it.
   */
  needsRehash: boolean;
}

/**
 * Verifies `plain` against `hash`, transparently handling both formats.
 *
 * NOTE the argument order — `(hash, plain)`, matching argon2.verify and the
 * REVERSE of bcrypt.compare(plain, hash).
 */
export const verifyPassword = async (
  hash: string,
  plain: string
): Promise<PasswordVerification> => {
  if (isLegacyHash(hash)) {
    const valid = await bcrypt.compare(plain, hash);
    // A correct password against a bcrypt hash is exactly the upgrade trigger.
    return { valid, needsRehash: valid };
  }

  try {
    const valid = await argon2.verify(hash, plain);
    return { valid, needsRehash: valid && argon2.needsRehash(hash) };
  } catch {
    // argon2.verify throws on a malformed/unrecognised hash. Treat that as a
    // failed login rather than a 500 — a corrupt row must not be a way in.
    return { valid: false, needsRehash: false };
  }
};
