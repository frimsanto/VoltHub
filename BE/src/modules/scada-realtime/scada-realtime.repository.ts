import { Prisma, ScadaGarduType, ScadaStatus } from '@prisma/client';
import prisma from '../../config/database';
import type { GarduQuery } from './scada-realtime.validation';

/**
 * SCADA real-time repository — the only layer touching Prisma for the INS/OOP
 * dashboard. All aggregation is pushed to SQL (groupBy / aggregate) so the
 * dashboard never pulls thousands of gardu rows just to count them.
 */
export const scadaRealtimeRepository = {
  /** Count gardu by current status for one type → { IN_SCAN, OOP, null }. */
  countByStatus(type: ScadaGarduType) {
    return prisma.scadaGardu.groupBy({
      by: ['currentStatus'],
      where: { garduType: type },
      _count: { _all: true },
    });
  },

  /** Average YTD availability + the latest data date for one type. */
  aggregate(type: ScadaGarduType) {
    return prisma.scadaGardu.aggregate({
      where: { garduType: type },
      _avg: { avaYtd: true },
      _max: { asOfDate: true },
    });
  },

  /**
   * Status breakdown grouped by an org dimension (rtupp for RC/GH, wilayah for
   * GI). Returns rows of { dim, currentStatus, _count } the service reshapes.
   */
  countByDimension(type: ScadaGarduType, dim: 'rtupp' | 'wilayah') {
    return prisma.scadaGardu.groupBy({
      by: [dim, 'currentStatus'],
      where: { garduType: type },
      _count: { _all: true },
    });
  },

  /** Total gardu of a type (for the `types` overview). */
  countAllByType() {
    return prisma.scadaGardu.groupBy({
      by: ['garduType', 'currentStatus'],
      _count: { _all: true },
    });
  },

  /** Paginated gardu list with optional status/search/rtupp filters. */
  async listGardu(q: GarduQuery) {
    const where: Prisma.ScadaGarduWhereInput = { garduType: q.type as ScadaGarduType };
    if (q.status) where.currentStatus = q.status as ScadaStatus;
    if (q.rtupp) where.rtupp = q.rtupp;
    if (q.search) where.code = { contains: q.search, mode: 'insensitive' as const };

    const [items, total] = await Promise.all([
      prisma.scadaGardu.findMany({
        where,
        orderBy: [{ currentStatus: 'asc' }, { code: 'asc' }], // OOP-then-IN_SCAN, code A→Z
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          code: true,
          up3: true,
          rtupp: true,
          wilayah: true,
          avaYtd: true,
          currentValue: true,
          currentStatus: true,
          asOfDate: true,
        },
      }),
      prisma.scadaGardu.count({ where }),
    ]);
    return { items, total };
  },
};
