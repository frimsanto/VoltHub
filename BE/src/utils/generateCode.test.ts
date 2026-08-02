import { describe, it, expect } from 'vitest';
import { slugifyCode, generateUniqueCode } from './generateCode';

describe('slugifyCode', () => {
  it('uppercases and keeps alphanumerics', () => {
    expect(slugifyCode('GI Grogol')).toBe('GI-GROGOL');
    expect(slugifyCode('TD250')).toBe('TD250');
    expect(slugifyCode('GH0202S')).toBe('GH0202S');
  });

  it('collapses and trims separators', () => {
    expect(slugifyCode('  Gardu  Pondok / Indah ')).toBe('GARDU-PONDOK-INDAH');
  });

  it('falls back when the name has no usable characters', () => {
    expect(slugifyCode('!!!', 'GARDU')).toBe('GARDU');
    expect(slugifyCode('')).toBe('ITM');
  });
});

describe('generateUniqueCode', () => {
  it('returns the slug when no collision', async () => {
    const code = await generateUniqueCode('GI Grogol', async () => false);
    expect(code).toBe('GI-GROGOL');
  });

  it('appends an incrementing suffix on collision', async () => {
    const taken = new Set(['GI-GROGOL', 'GI-GROGOL-2']);
    const code = await generateUniqueCode('GI Grogol', async (c) => taken.has(c));
    expect(code).toBe('GI-GROGOL-3');
  });

  it('respects the max length while de-duplicating', async () => {
    const code = await generateUniqueCode('x'.repeat(80), async (c) => c === 'X'.repeat(50), {
      maxLength: 50,
    });
    expect(code.length).toBeLessThanOrEqual(50);
    expect(code.endsWith('-2')).toBe(true);
  });
});
