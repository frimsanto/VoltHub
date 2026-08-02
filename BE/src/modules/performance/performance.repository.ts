import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { viaLocationScopeWhere, type TenantScope } from '../../utils/tenantScope';
import type { ListPerformanceQuery, SummaryQuery } from './performance.validation';

export interface PerformanceUpsertInput {
  locationId: string;
  performanceDate: Date;
  performanceStatus: number;
  score?: number | null;
}

/**
 * Performance Repository — Prisma access for `performance_daily`.
 * Writes happen ONLY through `upsertDaily` (called by the import engine),
 * which enforces one record per (site, date) (BR-012) via the unique key.
 */
export class PerformanceRepository {
  private buildWhere(
    q: { siteId?: string; locationId?: string; dateFrom?: Date; dateTo?: Date },
    scope: TenantScope
  ) {
    const locationId = q.siteId ?? q.locationId;
    const where: Prisma.PerformanceDailyWhereInput = {
      ...viaLocationScopeWhere(scope),
      ...(locationId ? { locationId } : {}),
      ...(q.dateFrom || q.dateTo
        ? {
            performanceDate: {
              ...(q.dateFrom ? { gte: q.dateFrom } : {}),
              ...(q.dateTo ? { lte: q.dateTo } : {}),
            },
          }
        : {}),
    };
    return where;
  }

  async findAll(query: ListPerformanceQuery, scope: TenantScope) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query, scope);

    const [data, total] = await Promise.all([
      prisma.performanceDaily.findMany({
        where,
        skip,
        take: limit,
        orderBy: { performanceDate: 'desc' },
        include: { location: { select: { id: true, code: true, name: true } } },
      }),
      prisma.performanceDaily.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.performanceDaily.findFirst({
      where: { id, ...(scope ? viaLocationScopeWhere(scope) : {}) },
      include: { location: { select: { id: true, code: true, name: true } } },
    });
  }

  async summary(query: SummaryQuery, scope: TenantScope) {
    const where = this.buildWhere(query, scope);
    const [total, berhasil, scoreAgg] = await Promise.all([
      prisma.performanceDaily.count({ where }),
      prisma.performanceDaily.count({ where: { ...where, performanceStatus: 1 } }),
      prisma.performanceDaily.aggregate({ where, _avg: { score: true } }),
    ]);
    const gagal = total - berhasil;
    return {
      total,
      berhasil,
      gagal,
      successRate: total > 0 ? Math.round((berhasil / total) * 10000) / 100 : 0,
      avgScore: scoreAgg._avg.score ?? null,
    };
  }

  /** Import-only write path (BR-010/011). Upsert keyed on (locationId, performanceDate) (BR-012). */
  upsertDaily(input: PerformanceUpsertInput) {
    return prisma.performanceDaily.upsert({
      where: {
        locationId_performanceDate: {
          locationId: input.locationId,
          performanceDate: input.performanceDate,
        },
      },
      create: {
        locationId: input.locationId,
        performanceDate: input.performanceDate,
        performanceStatus: input.performanceStatus,
        score: input.score ?? null,
      },
      update: {
        performanceStatus: input.performanceStatus,
        score: input.score ?? null,
      },
    });
  }
}

export const performanceRepository = new PerformanceRepository();
