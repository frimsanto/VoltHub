import { BusinessRuleError } from '../../utils/appError';

/**
 * REJECTED ("Tidak Sesuai") is a terminal WO state — cascaded reports must stay
 * read-only even though their own report-status (DRAFT/REJECTED) would otherwise
 * permit a revisi edit. A follow-up visit means a brand-new WO, not reopening this one.
 */
export function assertWoNotRejected(woStatus: string | null | undefined): void {
  if (woStatus === 'REJECTED') {
    throw new BusinessRuleError('Work Order ini berstatus Tidak Sesuai — laporan tidak dapat diubah');
  }
}
