import { assetTypeRepository, AssetTypeRepository } from './asset-type.repository';
import { ConflictError, NotFoundError, BusinessRuleError } from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import type {
  CreateAssetTypeInput,
  UpdateAssetTypeInput,
  ListAssetTypeQuery,
} from './asset-type.validation';

/**
 * Asset Type Service — asset taxonomy leaf (EPIC-3 Story 10).
 * Enforces FK to category and UNIQUE(assetCategoryId, name); blocks deletion
 * while assets still reference the type.
 */
export class AssetTypeService {
  constructor(private readonly repo: AssetTypeRepository = assetTypeRepository) {}

  async list(query: ListAssetTypeQuery) {
    const { data, total, page, limit } = await this.repo.findAll(query);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string) {
    const type = await this.repo.findById(id);
    if (!type) throw new NotFoundError('Asset type not found');
    return type;
  }

  private async assertCategoryExists(assetCategoryId: string) {
    const category = await this.repo.categoryExists(assetCategoryId);
    if (!category) throw new NotFoundError(`Asset category "${assetCategoryId}" not found`);
  }

  private async assertUniqueName(assetCategoryId: string, name: string, ignoreId?: string) {
    const existing = await this.repo.findByCategoryAndName(assetCategoryId, name);
    if (existing && existing.id !== ignoreId) {
      throw new ConflictError(`Asset type "${name}" already exists in this category`);
    }
  }

  async create(input: CreateAssetTypeInput, userId?: string) {
    await this.assertCategoryExists(input.assetCategoryId);
    await this.assertUniqueName(input.assetCategoryId, input.name);
    const created = await this.repo.create(input);
    await recordAuditLog({
      entityType: 'AssetType',
      entityId: created.id,
      action: 'CREATE',
      newValue: created,
      performedBy: userId,
    });
    return created;
  }

  async update(id: string, input: UpdateAssetTypeInput, userId?: string) {
    const current = await this.getById(id);
    const categoryId = input.assetCategoryId ?? current.assetCategoryId;
    const name = input.name ?? current.name;

    if (input.assetCategoryId) await this.assertCategoryExists(input.assetCategoryId);
    if (input.assetCategoryId || input.name) await this.assertUniqueName(categoryId, name, id);

    const updated = await this.repo.update(id, input);
    await recordAuditLog({
      entityType: 'AssetType',
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
    const assetCount = await this.repo.countAssets(id);
    if (assetCount > 0) {
      throw new BusinessRuleError(
        `Asset type is still used by ${assetCount} asset(s); reassign them first`
      );
    }
    await this.repo.delete(id);
    await recordAuditLog({
      entityType: 'AssetType',
      entityId: id,
      action: 'DELETE',
      oldValue: current,
      performedBy: userId,
    });
  }
}

export const assetTypeService = new AssetTypeService();
