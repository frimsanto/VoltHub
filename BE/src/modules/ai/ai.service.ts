import { aiRepository, AiRepository } from './ai.repository';
import { NotFoundError } from '../../utils/appError';
import type { TenantScope } from '../../utils/tenantScope';

/**
 * AI Service — assembles the AI-ready summary for a location query.
 * Response shape mirrors TDD §15: { location, assets, communicationMedia,
 * lastInspection, lastHar, documentCount }.
 *
 * `scope` is mandatory (fail-closed) — every call site must resolve it from
 * the caller's JWT via resolveRequestScope before reaching here.
 */
export class AiService {
  constructor(private readonly repo: AiRepository = aiRepository) {}

  async searchAssets(q: string, scope: TenantScope) {
    const location = await this.repo.resolveLocation(q, scope);
    if (!location) {
      throw new NotFoundError(`Tidak ada lokasi yang cocok dengan "${q}"`);
    }

    const [assets, communicationMedia, lastInspection, lastHar, documentCount] = await Promise.all([
      this.repo.assetsOfLocation(location.id, scope),
      this.repo.communicationMediaOfLocation(location.id, scope),
      this.repo.lastInspection(location.id, scope),
      this.repo.lastHar(location.id, scope),
      this.repo.documentCount(location.id, scope),
    ]);

    return {
      location: {
        id: location.id,
        code: location.code,
        name: location.name,
        locationType: location.locationType,
        up3: location.up3,
      },
      assetCount: assets.length,
      assets,
      communicationMedia,
      lastInspection,
      lastHar,
      documentCount,
    };
  }
}

export const aiService = new AiService();
