import { publicStatsRepository, PublicStatsRepository, PublicStats } from './public-stats.repository';

/**
 * Public Stats Service — serves the whitelisted aggregates with a small
 * in-memory TTL cache.
 *
 * The login page is unauthenticated and potentially hit by bots/scanners, so we
 * must never let it translate into per-request DB load. The numbers move slowly
 * (asset/site inventory changes over days, not seconds), so a short cache window
 * is more than fresh enough and keeps the endpoint effectively free.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class PublicStatsService {
  private cache: { data: PublicStats; expiresAt: number } | null = null;
  private inFlight: Promise<PublicStats> | null = null;

  constructor(private readonly repo: PublicStatsRepository = publicStatsRepository) {}

  async getPublicStats(): Promise<PublicStats> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.data;
    }

    // De-duplicate concurrent cache misses into a single DB pass.
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.repo
      .getPublicStats()
      .then((data) => {
        this.cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
        return data;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }
}

export const publicStatsService = new PublicStatsService();
