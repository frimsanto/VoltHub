import {
  communicationMediaRepository,
  CommunicationMediaRepository,
} from './communication-media.repository';
import { locationRepository } from '../locations/location.repository';
import { NotFoundError } from '../../utils/appError';
import type { TenantScope } from '../../utils/tenantScope';
import type {
  CreateCommunicationMediaInput,
  UpdateCommunicationMediaInput,
  ListCommunicationMediaQuery,
} from './communication-media.validation';

/**
 * CommunicationMedia Service — business logic only.
 * Enforces FK integrity (location must exist).
 */
export class CommunicationMediaService {
  constructor(private readonly repo: CommunicationMediaRepository = communicationMediaRepository) {}

  async list(query: ListCommunicationMediaQuery, scope: TenantScope) {
    const { data, total, page, limit } = await this.repo.findAll(query, scope);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string, scope: TenantScope) {
    const media = await this.repo.findById(id, scope);
    if (!media) throw new NotFoundError('Communication media not found');
    return media;
  }

  private async assertLocationExists(locationId: string, scope: TenantScope) {
    if (!(await locationRepository.findById(locationId, scope))) {
      throw new NotFoundError(`Location "${locationId}" not found`);
    }
  }

  async create(input: CreateCommunicationMediaInput, userId: string | undefined, scope: TenantScope) {
    await this.assertLocationExists(input.locationId, scope);
    return this.repo.create(input, userId);
  }

  async update(id: string, input: UpdateCommunicationMediaInput, userId: string | undefined, scope: TenantScope) {
    await this.getById(id, scope);
    if (input.locationId) await this.assertLocationExists(input.locationId, scope);
    return this.repo.update(id, input, userId);
  }

  async remove(id: string, userId: string | undefined, scope: TenantScope) {
    await this.getById(id, scope);
    await this.repo.softDelete(id, userId);
  }
}

export const communicationMediaService = new CommunicationMediaService();
