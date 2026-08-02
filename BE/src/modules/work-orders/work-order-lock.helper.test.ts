import { describe, it, expect } from 'vitest';
import { assertWoNotRejected } from './work-order-lock.helper';
import { BusinessRuleError } from '../../utils/appError';

describe('assertWoNotRejected', () => {
  it('throws when the linked WO is REJECTED ("Tidak Sesuai")', () => {
    expect(() => assertWoNotRejected('REJECTED')).toThrowError(BusinessRuleError);
  });

  it('is silent for any other WO status, or when there is no linked WO', () => {
    expect(() => assertWoNotRejected('ON_PROGRESS')).not.toThrow();
    expect(() => assertWoNotRejected(null)).not.toThrow();
    expect(() => assertWoNotRejected(undefined)).not.toThrow();
  });
});
