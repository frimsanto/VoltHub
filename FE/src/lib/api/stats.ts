import apiClient, { ApiResponse, handleResponse } from "./client";

/**
 * Public, unauthenticated operational aggregates — used by the login page to
 * render the "scale of the platform" metric strip. Backed by the cached
 * GET /v1/stats/public endpoint (whitelisted COUNTs only, no sensitive data).
 *
 * Note the explicit base override: the rest of this client talks to `/api`
 * (V1 reporting routes), but the public stats live under the V2 surface
 * `/api/v1`. We derive the V2 base from the same env var so dev/prod stay in
 * sync.
 */
const V2_BASE =
  (import.meta.env.VITE_API_URL || "http://localhost:3001/api").replace(/\/$/, "") + "/v1";

export interface PublicStats {
  sites: number;
  sitesByType: Record<string, number>;
  assets: number;
  assetsByType: Record<string, number>;
  feeders: number;
  inspections: number;
  harReports: number;
  performancePoints: number;
  geoCoveragePct: number;
  generatedAt: string;
}

export const getPublicStats = async (): Promise<PublicStats> => {
  const response = await apiClient.get<ApiResponse<PublicStats>>("/stats/public", {
    baseURL: V2_BASE,
    timeout: 8000,
  });
  return handleResponse(response);
};
