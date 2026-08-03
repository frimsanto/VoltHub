import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { hashPassword, verifyPassword, isLegacyHash } from './password';

// Real hashing (no mocks) — the whole point of these tests is the bcrypt ->
// Argon2id interop, which a mock would paper over.
const PLAIN = 'CorrectHorse123!';

describe('hashPassword', () => {
  it('produces an Argon2id hash', async () => {
    const hash = await hashPassword(PLAIN);
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('salts: the same password hashes differently every time', async () => {
    expect(await hashPassword(PLAIN)).not.toBe(await hashPassword(PLAIN));
  });
});

describe('isLegacyHash', () => {
  it('recognises the bcryptjs $2a$ prefix actually stored in this DB', () => {
    expect(isLegacyHash(bcrypt.hashSync(PLAIN, 10))).toBe(true);
  });

  it.each(['$2a$', '$2b$', '$2x$', '$2y$'])('recognises the %s variant', (prefix) => {
    expect(isLegacyHash(`${prefix}10$abcdefghijklmnopqrstuv`)).toBe(true);
  });

  it('does not flag an Argon2id hash', async () => {
    expect(isLegacyHash(await hashPassword(PLAIN))).toBe(false);
  });
});

describe('verifyPassword — Argon2id', () => {
  it('accepts the correct password without asking for a re-hash', async () => {
    const hash = await hashPassword(PLAIN);
    expect(await verifyPassword(hash, PLAIN)).toEqual({ valid: true, needsRehash: false });
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword(PLAIN);
    expect(await verifyPassword(hash, 'wrong')).toEqual({ valid: false, needsRehash: false });
  });
});

describe('verifyPassword — legacy bcrypt migration', () => {
  it('accepts a correct password against a bcrypt hash and flags it for re-hash', async () => {
    const legacy = bcrypt.hashSync(PLAIN, 10);
    expect(await verifyPassword(legacy, PLAIN)).toEqual({ valid: true, needsRehash: true });
  });

  it('rejects a wrong password against a bcrypt hash and does NOT flag a re-hash', async () => {
    const legacy = bcrypt.hashSync(PLAIN, 10);
    expect(await verifyPassword(legacy, 'wrong')).toEqual({ valid: false, needsRehash: false });
  });

  it('the re-hashed password verifies under Argon2id afterwards', async () => {
    const legacy = bcrypt.hashSync(PLAIN, 10);
    const { needsRehash } = await verifyPassword(legacy, PLAIN);
    expect(needsRehash).toBe(true);

    const upgraded = await hashPassword(PLAIN);
    expect(upgraded.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(upgraded, PLAIN)).toEqual({ valid: true, needsRehash: false });
  });
});

describe('verifyPassword — malformed input', () => {
  it.each([['empty', ''], ['garbage', 'not-a-hash'], ['truncated', '$argon2id$v=19$broken']])(
    'treats a %s hash as a failed login instead of throwing',
    async (_label, hash) => {
      await expect(verifyPassword(hash, PLAIN)).resolves.toEqual({
        valid: false,
        needsRehash: false,
      });
    }
  );
});
