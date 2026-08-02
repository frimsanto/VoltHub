import { feederRepository, FeederRepository } from './feeder.repository';
import { locationRepository } from '../locations/location.repository';
import { ConflictError, NotFoundError } from '../../utils/appError';
import { generateUniqueCode } from '../../utils/generateCode';
import type { CreateFeederInput, UpdateFeederInput, ListFeederQuery } from './feeder.validation';

/**
 * Feeder Service — business logic only.
 * Enforces FK integrity (location must exist) and the
 * UNIQUE(locationId, feederCode) rule before hitting the DB.
 */
export class FeederService {
  constructor(private readonly repo: FeederRepository = feederRepository) {}

  async list(query: ListFeederQuery) {
    const { data, total, page, limit } = await this.repo.findAll(query);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string) {
    const feeder = await this.repo.findById(id);
    if (!feeder) throw new NotFoundError('Feeder not found');
    return feeder;
  }

  private async assertLocationExists(locationId: string) {
    const location = await locationRepository.findById(locationId);
    if (!location) throw new NotFoundError(`Location "${locationId}" not found`);
  }

  private async assertUniqueCode(locationId: string, feederCode: string, ignoreId?: string) {
    const existing = await this.repo.findByLocationAndCode(locationId, feederCode);
    if (existing && existing.id !== ignoreId) {
      throw new ConflictError(`Feeder code "${feederCode}" already exists in this location`);
    }
  }

  async create(input: CreateFeederInput, userId?: string) {
    await this.assertLocationExists(input.locationId);

    let feederCode = input.feederCode?.trim();
    if (feederCode) {
      await this.assertUniqueCode(input.locationId, feederCode);
    } else {
      // UI path: derive a hidden, unique code from the feeder name (unique per location).
      feederCode = await generateUniqueCode(
        input.feederName,
        async (c) => !!(await this.repo.findByLocationAndCode(input.locationId, c)),
        { fallback: 'FD', maxLength: 50 },
      );
    }
    return this.repo.create({ ...input, feederCode }, userId);
  }

  async update(id: string, input: UpdateFeederInput, userId?: string) {
    const current = await this.getById(id);

    const locationId = input.locationId ?? current.locationId;
    const feederCode = input.feederCode ?? current.feederCode;

    if (input.locationId) await this.assertLocationExists(input.locationId);
    if (input.locationId || input.feederCode) {
      await this.assertUniqueCode(locationId, feederCode, id);
    }

    return this.repo.update(id, input, userId);
  }

  async remove(id: string, userId?: string) {
    await this.getById(id);
    await this.repo.softDelete(id, userId);
  }
}

export const feederService = new FeederService();
