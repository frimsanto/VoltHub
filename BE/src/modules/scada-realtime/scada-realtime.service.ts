import { ScadaGarduType } from '@prisma/client';
import { scadaRealtimeRepository as repo } from './scada-realtime.repository';
import type { GarduQuery, SummaryQuery } from './scada-realtime.validation';

export interface StatusCounts {
  total: number;
  inScan: number;
  oop: number;
  unknown: number; // gardu with no dated value yet
}

export interface ScadaSummary extends StatusCounts {
  type: ScadaGarduType;
  avaAvg: number | null; // mean %AVA YTD (0..1)
  asOfDate: string | null; // latest data date (ISO yyyy-mm-dd)
  dimension: 'rtupp' | 'wilayah';
  breakdown: (StatusCounts & { name: string })[];
}

/** Fold a groupBy-status result into {inScan, oop, unknown, total}. */
function foldStatus(
  rows: { currentStatus: string | null; _count: { _all: number } }[],
): StatusCounts {
  let inScan = 0, oop = 0, unknown = 0;
  for (const r of rows) {
    const n = r._count._all;
    if (r.currentStatus === 'IN_SCAN') inScan += n;
    else if (r.currentStatus === 'OOP') oop += n;
    else unknown += n;
  }
  return { total: inScan + oop + unknown, inScan, oop, unknown };
}

export const scadaRealtimeService = {
  /** Headline INS/OOP figures + org breakdown for one gardu type. */
  async getSummary(q: SummaryQuery): Promise<ScadaSummary> {
    const type = q.type as ScadaGarduType;
    const dim: 'rtupp' | 'wilayah' = type === 'GI' ? 'wilayah' : 'rtupp';

    const [statusRows, agg, dimRows] = await Promise.all([
      repo.countByStatus(type),
      repo.aggregate(type),
      repo.countByDimension(type, dim),
    ]);

    const totals = foldStatus(statusRows);

    // Reshape the (dim, status) cross-tab into one row per org unit.
    const byDim = new Map<string, StatusCounts & { name: string }>();
    for (const r of dimRows) {
      const name = (r as Record<string, unknown>)[dim] as string | null;
      const key = name ?? '—';
      const cur = byDim.get(key) ?? { name: key, total: 0, inScan: 0, oop: 0, unknown: 0 };
      const n = r._count._all;
      if (r.currentStatus === 'IN_SCAN') cur.inScan += n;
      else if (r.currentStatus === 'OOP') cur.oop += n;
      else cur.unknown += n;
      cur.total += n;
      byDim.set(key, cur);
    }
    const breakdown = [...byDim.values()].sort((a, b) => b.oop - a.oop || b.total - a.total);

    return {
      type,
      ...totals,
      avaAvg: agg._avg.avaYtd ?? null,
      asOfDate: agg._max.asOfDate ? agg._max.asOfDate.toISOString().slice(0, 10) : null,
      dimension: dim,
      breakdown,
    };
  },

  /** Per-type totals (for the dropdown overview cards). */
  async getTypes() {
    const rows = await repo.countAllByType();
    const byType = new Map<string, StatusCounts & { type: string }>();
    for (const t of ['RC', 'GH', 'GI', 'GFD']) {
      byType.set(t, { type: t, total: 0, inScan: 0, oop: 0, unknown: 0 });
    }
    for (const r of rows) {
      const cur = byType.get(r.garduType)!;
      const n = r._count._all;
      if (r.currentStatus === 'IN_SCAN') cur.inScan += n;
      else if (r.currentStatus === 'OOP') cur.oop += n;
      else cur.unknown += n;
      cur.total += n;
    }
    return [...byType.values()];
  },

  /** Paginated gardu list (drill-down). */
  async listGardu(q: GarduQuery) {
    const { items, total } = await repo.listGardu(q);
    return {
      items: items.map((g) => ({
        ...g,
        asOfDate: g.asOfDate ? g.asOfDate.toISOString().slice(0, 10) : null,
      })),
      meta: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  },
};
