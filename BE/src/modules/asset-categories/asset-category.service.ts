import { assetCategoryRepository, AssetCategoryRepository } from './asset-category.repository';
import { ConflictError, NotFoundError, BusinessRuleError } from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import type {
  CreateAssetCategoryInput,
  UpdateAssetCategoryInput,
  ListAssetCategoryQuery,
} from './asset-category.validation';

/**
 * Asset Category Service — global asset taxonomy (EPIC-3 Story 9).
 * Enforces unique `name` and blocks deletion while child asset types exist.
 */
export class AssetCategoryService {
  constructor(private readonly repo: AssetCategoryRepository = assetCategoryRepository) {}

  async list(query: ListAssetCategoryQuery) {
    const { data, total, page, limit } = await this.repo.findAll(query);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string) {
    const category = await this.repo.findById(id);
    if (!category) throw new NotFoundError('Asset category not found');
    return category;
  }

  private async assertUniqueName(name: string, ignoreId?: string) {
    const existing = await this.repo.findByName(name);
    if (existing && existing.id !== ignoreId) {
      throw new ConflictError(`Asset category "${name}" already exists`);
    }
  }

  async create(input: CreateAssetCategoryInput, userId?: string) {
    await this.assertUniqueName(input.name);
    const created = await this.repo.create(input);
    await recordAuditLog({
      entityType: 'AssetCategory',
      entityId: created.id,
      action: 'CREATE',
      newValue: created,
      performedBy: userId,
    });
    return created;
  }

  async update(id: string, input: UpdateAssetCategoryInput, userId?: string) {
    const current = await this.getById(id);
    if (input.name) await this.assertUniqueName(input.name, id);
    const updated = await this.repo.update(id, input);
    await recordAuditLog({
      entityType: 'AssetCategory',
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
    const typeCount = await this.repo.countTypes(id);
    if (typeCount > 0) {
      throw new BusinessRuleError(
        `Asset category still has ${typeCount} asset type(s); remove them first`
      );
    }
    await this.repo.delete(id);
    await recordAuditLog({
      entityType: 'AssetCategory',
      entityId: id,
      action: 'DELETE',
      oldValue: current,
      performedBy: userId,
    });
  }
}

export const assetCategoryService = new AssetCategoryService();
