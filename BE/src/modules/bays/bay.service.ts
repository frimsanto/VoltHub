import { bayRepository, BayRepository } from './bay.repository';
import { ConflictError, NotFoundError, BusinessRuleError } from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import type { TenantScope } from '../../utils/tenantScope';
import type { CreateBayInput, UpdateBayInput, ListBayQuery } from './bay.validation';

/**
 * Bay Service — master data for the GI → Bay level. FK integrity (owning GI),
 * per-RTUPP scoping and unique (location, code) are enforced here; every
 * mutation is written to the canonical audit trail.
 */
export class BayService {
  constructor(private readonly repo: BayRepository = bayRepository) {}

  async list(query: ListBayQuery, scope: TenantScope) {
    const { data, total, page, limit } = await this.repo.findAll(query, scope);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string, scope: TenantScope) {
    const bay = await this.repo.findById(id, scope);
    if (!bay) throw new NotFoundError('Bay not found');
    return bay;
  }

  private async assertGiLocation(locationId: string, scope: TenantScope) {
    const location = await this.repo.locationExists(locationId, scope);
    if (!location) throw new NotFoundError(`GI/Lokasi "${locationId}" not found`);
    if (location.locationType !== 'GI') {
      throw new BusinessRuleError('Bay hanya dapat dibuat pada lokasi bertipe GI');
    }
  }

  async create(input: CreateBayInput, userId: string | undefined, scope: TenantScope) {
    await this.assertGiLocation(input.locationId, scope);
    if (await this.repo.findByLocationAndCode(input.locationId, input.code)) {
      throw new ConflictError(`Bay "${input.code}" sudah ada di GI ini`);
    }
    const created = await this.repo.create({ ...input, createdBy: userId ?? null });
    await recordAuditLog({
      entityType: 'Bay',
      entityId: created.id,
      action: 'CREATE',
      newValue: created,
      performedBy: userId,
    });
    return created;
  }

  async update(id: string, input: UpdateBayInput, userId: string | undefined, scope: TenantScope) {
    const current = await this.getById(id, scope);
    if (input.code && input.code !== current.code) {
      const dup = await this.repo.findByLocationAndCode(current.locationId, input.code);
      if (dup && dup.id !== id) throw new ConflictError(`Bay "${input.code}" sudah ada di GI ini`);
    }
    const updated = await this.repo.update(id, { ...input, updatedBy: userId ?? null });
    await recordAuditLog({
      entityType: 'Bay',
      entityId: id,
      action: 'UPDATE',
      oldValue: current,
      newValue: updated,
      performedBy: userId,
    });
    return updated;
  }

  async remove(id: string, userId: string | undefined, scope: TenantScope) {
    const current = await this.getById(id, scope);
    await this.repo.softDelete(id);
    await recordAuditLog({
      entityType: 'Bay',
      entityId: id,
      action: 'DELETE',
      oldValue: current,
      performedBy: userId,
    });
  }
}

export const bayService = new BayService();
