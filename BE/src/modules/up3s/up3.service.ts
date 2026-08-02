import { up3Repository, Up3Repository } from './up3.repository';
import { ConflictError, NotFoundError } from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import type { CreateUp3Input, UpdateUp3Input, ListUp3Query } from './up3.validation';

/**
 * UP3 Service — master data under an RTUPP.
 * Enforces FK integrity (rtupp must exist) and UNIQUE(rtuppId, code).
 */
export class Up3Service {
  constructor(private readonly repo: Up3Repository = up3Repository) {}

  async list(query: ListUp3Query) {
    const { data, total, page, limit } = await this.repo.findAll(query);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string) {
    const up3 = await this.repo.findById(id);
    if (!up3) throw new NotFoundError('UP3 not found');
    return up3;
  }

  private async assertRtuppExists(rtuppId: string) {
    const rtupp = await this.repo.rtuppExists(rtuppId);
    if (!rtupp) throw new NotFoundError(`RTUPP "${rtuppId}" not found`);
  }

  private async assertUniqueCode(rtuppId: string, code: string, ignoreId?: string) {
    const existing = await this.repo.findByRtuppAndCode(rtuppId, code);
    if (existing && existing.id !== ignoreId) {
      throw new ConflictError(`UP3 code "${code}" already exists in this RTUPP`);
    }
  }

  async create(input: CreateUp3Input, userId?: string) {
    await this.assertRtuppExists(input.rtuppId);
    await this.assertUniqueCode(input.rtuppId, input.code);
    const created = await this.repo.create(input);
    await recordAuditLog({
      entityType: 'Up3',
      entityId: created.id,
      action: 'CREATE',
      newValue: created,
      performedBy: userId,
    });
    return created;
  }

  async update(id: string, input: UpdateUp3Input, userId?: string) {
    const current = await this.getById(id);
    const rtuppId = input.rtuppId ?? current.rtuppId;
    const code = input.code ?? current.code;

    if (input.rtuppId) await this.assertRtuppExists(input.rtuppId);
    if (input.rtuppId || input.code) await this.assertUniqueCode(rtuppId, code, id);

    const updated = await this.repo.update(id, input);
    await recordAuditLog({
      entityType: 'Up3',
      entityId: id,
      action: 'UPDATE',
      oldValue: current,
      newValue: updated,
      performedBy: userId,
    });
    return updated;
  }

  async remove(id: string, userId?: string) {
    const current = await this.getById(id);
    await this.repo.delete(id);
    await recordAuditLog({
      entityType: 'Up3',
      entityId: id,
      action: 'DELETE',
      oldValue: current,
      performedBy: userId,
    });
  }
}

export const up3Service = new Up3Service();
