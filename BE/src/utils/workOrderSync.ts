import type { Prisma, WorkOrderStatus } from '@prisma/client';
import prisma from '../config/database';

/**
 * Best-effort mirror of a Work Order's status from a linked Laporan event
 * (Operation Management System GI RTUPP1).
 *
 * The WO wraps the Laporan Awal/Akhir lifecycle:
 *   Laporan Awal/Akhir created → WO ON_PROGRESS
 *   Laporan Akhir submitted    → WO WAITING_APPROVAL
 *   Laporan Akhir approved      → WO APPROVED
 *   Laporan Akhir rejected      → WO REJECTED
 *
 * This NEVER throws — the WO is a mirror and must never block the laporan flow.
 * A CLOSED WO is never moved back by report events.
 */
export async function syncWorkOrderStatus(
  workOrderId: string | null | undefined,
  to: WorkOrderStatus,
  extra: Prisma.WorkOrderUpdateInput = {}
): Promise<void> {
  if (!workOrderId) return;
  try {
    const wo = await prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!wo) return;
    if (wo.status === 'CLOSED') return; // terminal — only an explicit reopen moves it
    if (wo.status === to) {
      if (Object.keys(extra).length === 0) return;
    }
    await prisma.workOrder.update({ where: { id: workOrderId }, data: { status: to, ...extra } });
  } catch (err) {
    console.error('[workOrderSync] failed to sync WO', workOrderId, '→', to, err);
  }
}
