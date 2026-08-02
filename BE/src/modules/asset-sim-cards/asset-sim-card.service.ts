import { assetSimCardRepository, AssetSimCardRepository } from './asset-sim-card.repository';
import { assetRepository } from '../assets/asset.repository';
import { ConflictError, NotFoundError } from '../../utils/appError';
import type { TenantScope } from '../../utils/tenantScope';
import type { CreateSimCardInput, UpdateSimCardInput } from './asset-sim-card.validation';

/**
 * AssetSimCard Service — business logic only.
 * Enforces the parent asset exists and UNIQUE(assetId, simSlot).
 */
export class AssetSimCardService {
  constructor(private readonly repo: AssetSimCardRepository = assetSimCardRepository) {}

  private async assertAssetExists(assetId: string, scope: TenantScope) {
    if (!(await assetRepository.findById(assetId, scope))) {
      throw new NotFoundError(`Asset "${assetId}" not found`);
    }
  }

  async listByAsset(assetId: string, scope: TenantScope) {
    await this.assertAssetExists(assetId, scope);
    return this.repo.findByAsset(assetId);
  }

  async getById(id: string, scope: TenantScope) {
    const sim = await this.repo.findById(id, scope);
    if (!sim) throw new NotFoundError('SIM card not found');
    return sim;
  }

  async create(assetId: string, input: CreateSimCardInput, userId: string | undefined, scope: TenantScope) {
    await this.assertAssetExists(assetId, scope);
    const existing = await this.repo.findByAssetAndSlot(assetId, input.simSlot);
    if (existing) {
      throw new ConflictError(`SIM slot ${input.simSlot} already used for this asset`);
    }
    return this.repo.create(assetId, input, userId);
  }

  async update(id: string, input: UpdateSimCardInput, userId: string | undefined, scope: TenantScope) {
    const current = await this.getById(id, scope);
    if (input.simSlot !== undefined && input.simSlot !== current.simSlot) {
      const clash = await this.repo.findByAssetAndSlot(current.assetId, input.simSlot);
      if (clash && clash.id !== id) {
        throw new ConflictError(`SIM slot ${input.simSlot} already used for this asset`);
      }
    }
    return this.repo.update(id, input, userId);
  }

  async remove(id: string, scope: TenantScope) {
    await this.getById(id, scope);
    await this.repo.delete(id);
  }
}

export const assetSimCardService = new AssetSimCardService();
