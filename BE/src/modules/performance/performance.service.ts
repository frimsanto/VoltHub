import { performanceRepository, PerformanceRepository, PerformanceUpsertInput } from './performance.repository';
import { NotFoundError } from '../../utils/appError';
import type { TenantScope } from '../../utils/tenantScope';
import type { ListPerformanceQuery, SummaryQuery } from './performance.validation';

/**
 * Performance Service — read access + the import-only write path.
 *
 * Per BR-010/011 there is NO public create/update/delete. `recordFromImport`
 * is the single write entry point and is consumed exclusively by the import
 * engine; it upserts on (site, date) to satisfy BR-012 (one record per date).
 */
export class PerformanceService {
  constructor(private readonly repo: PerformanceRepository = performanceRepository) {}

  async list(query: ListPerformanceQuery, scope: TenantScope) {
    const { data, total, page, limit } = await this.repo.findAll(query, scope);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string, scope: TenantScope) {
    const record = await this.repo.findById(id, scope);
    if (!record) throw new NotFoundError('Performance record not found');
    return record;
  }

  summary(query: SummaryQuery, scope: TenantScope) {
    return this.repo.summary(query, scope);
  }

  /** Import-only write path. Returns the upserted row. */
  recordFromImport(input: PerformanceUpsertInput) {
    return this.repo.upsertDaily(input);
  }
}

export const performanceService = new PerformanceService();
