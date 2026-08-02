import { describe, it, expect } from 'vitest';
import {
  validationActionToStatus,
  canValidate,
  isPetugasEditable,
  tallyStatusCounts,
  emptyStatusCounts,
  REPORT_STATUSES,
} from './reportStatus';

describe('reportStatus', () => {
  describe('validationActionToStatus', () => {
    it('maps APPROVED -> APPROVED', () => {
      expect(validationActionToStatus('APPROVED')).toBe('APPROVED');
    });
    it('maps REJECTED -> REJECTED', () => {
      expect(validationActionToStatus('REJECTED')).toBe('REJECTED');
    });
    it('maps REVISION_REQUESTED -> REVISED (unified status)', () => {
      expect(validationActionToStatus('REVISION_REQUESTED')).toBe('REVISED');
    });
  });

  describe('canValidate', () => {
    it('allows validating PENDING and DRAFT', () => {
      expect(canValidate('PENDING')).toBe(true);
      expect(canValidate('DRAFT')).toBe(true);
    });
    it('forbids validating terminal/illegal states', () => {
      expect(canValidate('APPROVED')).toBe(false);
      expect(canValidate('REJECTED')).toBe(false);
      expect(canValidate('REVISED')).toBe(false);
      expect(canValidate(null)).toBe(false);
      expect(canValidate(undefined)).toBe(false);
    });
  });

  describe('isPetugasEditable', () => {
    // Canonical design: a PETUGAS owns DRAFT (not yet submitted) and PENDING
    // (awaiting validation) and may still correct them. Once a validator has
    // acted (APPROVED/REJECTED/REVISED) the report is locked.
    it('allows editing DRAFT and PENDING', () => {
      expect(isPetugasEditable('DRAFT')).toBe(true);
      expect(isPetugasEditable('PENDING')).toBe(true);
    });
    it('locks APPROVED, REJECTED, and REVISED', () => {
      expect(isPetugasEditable('APPROVED')).toBe(false);
      expect(isPetugasEditable('REJECTED')).toBe(false);
      expect(isPetugasEditable('REVISED')).toBe(false);
    });
  });

  describe('tallyStatusCounts', () => {
    it('folds groupBy rows into a status bucket', () => {
      const counts = tallyStatusCounts([
        { status: 'APPROVED', _count: { status: 3 } },
        { status: 'PENDING', _count: { status: 2 } },
        { status: 'DRAFT', _count: 1 },
      ]);
      expect(counts.APPROVED).toBe(3);
      expect(counts.PENDING).toBe(2);
      expect(counts.DRAFT).toBe(1);
      expect(counts.total).toBe(6);
    });
    it('ignores unknown status keys', () => {
      const counts = tallyStatusCounts([
        { status: 'NONSENSE', _count: { status: 9 } },
      ]);
      expect(counts.total).toBe(0);
    });
  });

  it('emptyStatusCounts has every canonical status zeroed', () => {
    const empty = emptyStatusCounts();
    for (const s of REPORT_STATUSES) {
      expect(empty[s as keyof typeof empty]).toBe(0);
    }
    expect(empty.total).toBe(0);
  });
});
