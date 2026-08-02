import { auditLogRepository, AuditLogRepository } from './audit-log.repository';
import { NotFoundError } from '../../utils/appError';
import type { ListAuditLogQuery } from './audit-log.validation';

/**
 * Audit Log Service — read-only (BR-018). No mutation methods exist.
 */
export class AuditLogService {
  constructor(private readonly repo: AuditLogRepository = auditLogRepository) {}

  async list(query: ListAuditLogQuery) {
    const { data, total, page, limit } = await this.repo.findAll(query);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string) {
    const log = await this.repo.findById(id);
    if (!log) throw new NotFoundError('Audit log not found');
    return log;
  }
}

export const auditLogService = new AuditLogService();
