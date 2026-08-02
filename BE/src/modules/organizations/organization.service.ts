import { organizationRepository, OrganizationRepository } from './organization.repository';
import { ConflictError, NotFoundError, BusinessRuleError } from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  ListOrganizationQuery,
} from './organization.validation';

/**
 * Organization Service — global master data (top of the org tree).
 * Enforces unique `code` and guards deletion while child RTUPPs exist.
 */
export class OrganizationService {
  constructor(private readonly repo: OrganizationRepository = organizationRepository) {}

  async list(query: ListOrganizationQuery) {
    const { data, total, page, limit } = await this.repo.findAll(query);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string) {
    const org = await this.repo.findById(id);
    if (!org) throw new NotFoundError('Organization not found');
    return org;
  }

  private async assertUniqueCode(code: string, ignoreId?: string) {
    const existing = await this.repo.findByCode(code);
    if (existing && existing.id !== ignoreId) {
      throw new ConflictError(`Organization code "${code}" already exists`);
    }
  }

  async create(input: CreateOrganizationInput, userId?: string) {
    await this.assertUniqueCode(input.code);
    const created = await this.repo.create(input);
    await recordAuditLog({
      entityType: 'Organization',
      entityId: created.id,
      action: 'CREATE',
      newValue: created,
      performedBy: userId,
    });
    return created;
  }

  async update(id: string, input: UpdateOrganizationInput, userId?: string) {
    const current = await this.getById(id);
    if (input.code) await this.assertUniqueCode(input.code, id);
    const updated = await this.repo.update(id, input);
    await recordAuditLog({
      entityType: 'Organization',
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
    const childCount = await this.repo.countRtupps(id);
    if (childCount > 0) {
      throw new BusinessRuleError(
        `Organization still has ${childCount} RTUPP(s); reassign or remove them first`
      );
    }
    await this.repo.delete(id);
    await recordAuditLog({
      entityType: 'Organization',
      entityId: id,
      action: 'DELETE',
      oldValue: current,
      performedBy: userId,
    });
  }
}

export const organizationService = new OrganizationService();
