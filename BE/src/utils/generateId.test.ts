import { describe, it, expect } from 'vitest';
import {
  generateUUID,
  generateReportId,
  isUniqueConstraintError,
  generateShortId,
} from './generateId';

describe('generateId utils', () => {
  describe('generateUUID', () => {
    it('produces a valid v4 UUID', () => {
      const id = generateUUID();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('produces unique values across many calls (no collision)', () => {
      const set = new Set<string>();
      for (let i = 0; i < 5000; i++) set.add(generateUUID());
      expect(set.size).toBe(5000);
    });
  });

  describe('generateReportId', () => {
    it('uses the prefix and current year', () => {
      const id = generateReportId('LA');
      const year = new Date().getFullYear();
      expect(id.startsWith(`LA-${year}-`)).toBe(true);
    });
  });

  describe('isUniqueConstraintError', () => {
    it('detects Prisma P2002 errors', () => {
      expect(isUniqueConstraintError({ code: 'P2002' })).toBe(true);
    });
    it('rejects other errors and non-objects', () => {
      expect(isUniqueConstraintError({ code: 'P2025' })).toBe(false);
      expect(isUniqueConstraintError(new Error('boom'))).toBe(false);
      expect(isUniqueConstraintError(null)).toBe(false);
      expect(isUniqueConstraintError('P2002')).toBe(false);
    });
  });

  describe('generateShortId', () => {
    it('respects the requested length and charset', () => {
      const id = generateShortId(12);
      expect(id).toHaveLength(12);
      expect(id).toMatch(/^[A-Z0-9]+$/);
    });
    it('defaults to length 8', () => {
      expect(generateShortId()).toHaveLength(8);
    });
  });
});
