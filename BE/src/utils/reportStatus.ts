import { ReportStatus, ValidationAction } from '@prisma/client';

/**
 * Single source of truth for report status handling across LaporanAwal
 * and LaporanAkhir. Both modules share the canonical Prisma `ReportStatus`
 * enum.
 */
export const REPORT_STATUSES = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'REVISED',
] as const;

export type ReportStatusValue = (typeof REPORT_STATUSES)[number];

/** Statuses that a validator is allowed to act on. */
export const VALIDATABLE_STATUSES: ReportStatusValue[] = ['PENDING', 'DRAFT'];

export const canValidate = (status: string | null | undefined): boolean =>
  !!status && VALIDATABLE_STATUSES.includes(status as ReportStatusValue);

/**
 * Statuses in which a PETUGAS may still edit or delete their own report.
 * DRAFT is the working state (not yet submitted) and PENDING is awaiting
 * validation — both are still "owned" by the petugas and may be corrected.
 * Once a validator has acted (APPROVED, REJECTED, REVISED) the report is
 * locked: the decision is final and the petugas can no longer change it.
 */
export const PETUGAS_EDITABLE_STATUSES: ReportStatusValue[] = ['DRAFT', 'PENDING'];

export const isPetugasEditable = (status: string | null | undefined): boolean =>
  !!status && PETUGAS_EDITABLE_STATUSES.includes(status as ReportStatusValue);

/**
 * Map a validation action to the stored report status.
 * Unified across all report types: a revision request becomes REVISED.
 */
export const validationActionToStatus = (
  action: ValidationAction | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED'
): ReportStatusValue => {
  switch (action) {
    case 'APPROVED':
      return 'APPROVED';
    case 'REVISION_REQUESTED':
      return 'REVISED';
    case 'REJECTED':
    default:
      return 'REJECTED';
  }
};

export type StatusCounts = {
  total: number;
  DRAFT: number;
  PENDING: number;
  APPROVED: number;
  REJECTED: number;
  REVISED: number;
};

/** Zeroed count bucket covering every canonical status. */
export const emptyStatusCounts = (): StatusCounts => ({
  total: 0,
  DRAFT: 0,
  PENDING: 0,
  APPROVED: 0,
  REJECTED: 0,
  REVISED: 0,
});

/**
 * Fold a Prisma `groupBy({ by: ['status'] })` result into a StatusCounts bucket.
 */
export const tallyStatusCounts = (
  rows: Array<{ status: string | null; _count: { status: number } | number }>
): StatusCounts => {
  const result = emptyStatusCounts();
  for (const row of rows) {
    const key = row.status as keyof StatusCounts;
    const count =
      typeof row._count === 'number' ? row._count : row._count.status;
    if (key && key in result && key !== 'total') {
      result[key] = count;
      result.total += count;
    }
  }
  return result;
};

export { ReportStatus };
