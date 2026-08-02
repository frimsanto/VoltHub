// VoltHub V2 — API Client (Asset Management domain)
//
// Architecture decision (Phase 0): V2 reuses the *existing* axios instance from
// `lib/api/client.ts`. That instance already carries every cross-cutting concern
// we need — Bearer injection, single-flight refresh-token rotation, 401→refresh,
// 426 force-update gate, 403/5xx handling, and Sentry capture. We do NOT create a
// second axios instance (which would duplicate interceptors and drift).
//
// The V1 client baseURL is `<host>/api`. The V2 OpenAPI server is `/api/v1`.
// Therefore every V2 request is the existing client + a `/v1` path prefix:
//   apiClient.get("/v1/locations")  ->  <host>/api/v1/locations
//
// Auth endpoints stay on the V1 base (`/api/auth/*`) and are shared, untouched.
//
// Responses follow the shared envelope `{ success, message, data, meta }`
// (ApiResponse<T>). Helpers below unwrap `data` and surface `meta` for paginated
// lists, so feature hooks/components never touch axios directly (TDD §2:
// Page → Feature Component → API Client → Backend).

import type { AxiosRequestConfig } from "axios";
import apiClient, { handleResponse, type ApiResponse } from "@/lib/api/client";
import type { paths } from "./types.gen";

/** All V2 requests are prefixed with the OpenAPI server segment. */
export const V2_PREFIX = "/v1";

const url = (path: string): string => `${V2_PREFIX}${path}`;

// ── Pagination meta (mirrors ApiResponse.meta from the shared envelope) ────────
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** A list result: unwrapped rows + pagination meta. */
export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

const DEFAULT_META: PageMeta = { page: 1, limit: 20, total: 0, totalPages: 0 };

// ── Verb helpers ───────────────────────────────────────────────────────────────
// Each returns the unwrapped `data` payload (throws on success=false via
// handleResponse). Generics let callers bind request/response types from
// `types.gen.ts` (see `Schemas` re-export in ./index.ts).

export async function v2Get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await apiClient.get<ApiResponse<T>>(url(path), config);
  return handleResponse(res);
}

export async function v2Post<T, B = unknown>(
  path: string,
  body?: B,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await apiClient.post<ApiResponse<T>>(url(path), body, config);
  return handleResponse(res);
}

export async function v2Put<T, B = unknown>(
  path: string,
  body?: B,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await apiClient.put<ApiResponse<T>>(url(path), body, config);
  return handleResponse(res);
}

export async function v2Patch<T, B = unknown>(
  path: string,
  body?: B,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await apiClient.patch<ApiResponse<T>>(url(path), body, config);
  return handleResponse(res);
}

export async function v2Delete<T = void>(path: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await apiClient.delete<ApiResponse<T>>(url(path), config);
  return handleResponse(res);
}

/**
 * List helper for paginated endpoints. Returns rows + meta in one shape so list
 * pages can bind directly to DataTable (server-side pagination, DESIGN_SYSTEM §3).
 */
export async function v2List<T>(
  path: string,
  params?: Record<string, unknown>,
): Promise<Paginated<T>> {
  const res = await apiClient.get<ApiResponse<T[]>>(url(path), { params });
  if (!res.data.success) {
    throw new Error(res.data.message || "Request failed");
  }
  return {
    items: res.data.data ?? [],
    meta: { ...DEFAULT_META, ...(res.data.meta as Partial<PageMeta> | undefined) },
  };
}

/**
 * Multipart upload helper (photos, documents, import files). Lets callers pass an
 * onUploadProgress for progress bars (DESIGN_SYSTEM §7).
 */
export async function v2Upload<T>(
  path: string,
  form: FormData,
  onUploadProgress?: AxiosRequestConfig["onUploadProgress"],
): Promise<T> {
  const res = await apiClient.post<ApiResponse<T>>(url(path), form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });
  return handleResponse(res);
}

/**
 * Blob download helper (generated report PDFs). Bypasses the envelope — the
 * backend streams the file directly. Returns the Blob for the caller to save.
 */
export async function v2Download(path: string, config?: AxiosRequestConfig): Promise<Blob> {
  const res = await apiClient.get<Blob>(url(path), { ...config, responseType: "blob" });
  return res.data;
}

/**
 * Resolve a backend-stored file path ("/uploads/images/…", "/uploads/documents/…")
 * to an absolute URL the browser can load. Uploads are served by the backend
 * origin (NOT under /api), so strip the trailing /api from the configured base.
 * Mirrors `resolveAvatarUrl` in lib/api/auth.ts.
 */
export function v2FileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  const base = (import.meta.env.VITE_API_URL || "http://localhost:3001/api").replace(
    /\/api\/?$/,
    "",
  );
  return `${base}${path}`;
}

// Re-export the shared error formatter so V2 feature code has one import surface.
export { handleError } from "@/lib/api/client";
export type { ApiResponse } from "@/lib/api/client";

// Re-export the generated path map for callers that want fully-typed bindings.
export type { paths } from "./types.gen";
export type V2Paths = paths;
