// VoltHub V2 — generic CRUD resource factory.
// Given a resource path, builds the typed API calls (over the shared V2 client)
// and the matching TanStack Query hooks (list/detail/create/update/remove) with
// consistent toasts + cache invalidation. Keeps the 5 master-data modules DRY and
// uniform (TDD §2: Page → Feature Component → API Client → Backend).

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { v2List, v2Get, v2Post, v2Put, v2Delete, handleError } from "@/lib/api/v2";
import type { Paginated } from "@/lib/api/v2";

export function createResource<
  Row,
  Detail,
  Create,
  Update = Create,
  Params extends Record<string, unknown> = Record<string, unknown>,
>(cfg: {
  key: string;
  /** Base path under /api/v1, e.g. "/locations". */
  path: string;
  labels?: { entity?: string };
}) {
  const entity = cfg.labels?.entity ?? cfg.key;

  const keys = {
    all: [cfg.key] as const,
    lists: () => [cfg.key, "list"] as const,
    list: (p?: Params) => [cfg.key, "list", p ?? {}] as const,
    details: () => [cfg.key, "detail"] as const,
    detail: (id: string) => [cfg.key, "detail", id] as const,
  };

  const api = {
    list: (params?: Params): Promise<Paginated<Row>> => v2List<Row>(cfg.path, params),
    get: (id: string): Promise<Detail> => v2Get<Detail>(`${cfg.path}/${id}`),
    create: (body: Create): Promise<Detail> => v2Post<Detail, Create>(cfg.path, body),
    update: (id: string, body: Update): Promise<Detail> =>
      v2Put<Detail, Update>(`${cfg.path}/${id}`, body),
    remove: (id: string): Promise<void> => v2Delete(`${cfg.path}/${id}`),
  };

  function useList(params?: Params, opts?: { enabled?: boolean }) {
    return useQuery({
      queryKey: keys.list(params),
      queryFn: () => api.list(params),
      placeholderData: keepPreviousData,
      enabled: opts?.enabled ?? true,
    });
  }

  function useOne(id: string | undefined) {
    return useQuery({
      queryKey: keys.detail(id ?? "—"),
      queryFn: () => api.get(id as string),
      enabled: !!id,
    });
  }

  function useCreate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (body: Create) => api.create(body),
      onSuccess: () => {
        toast.success(`${entity} berhasil dibuat`);
        qc.invalidateQueries({ queryKey: keys.lists() });
      },
      onError: (e) => toast.error(handleError(e as never)),
    });
  }

  function useUpdate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ id, body }: { id: string; body: Update }) => api.update(id, body),
      onSuccess: (_d, { id }) => {
        toast.success(`${entity} berhasil diperbarui`);
        qc.invalidateQueries({ queryKey: keys.lists() });
        qc.invalidateQueries({ queryKey: keys.detail(id) });
      },
      onError: (e) => toast.error(handleError(e as never)),
    });
  }

  function useRemove() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => api.remove(id),
      onSuccess: () => {
        toast.success(`${entity} berhasil dihapus`);
        qc.invalidateQueries({ queryKey: keys.lists() });
      },
      onError: (e) => toast.error(handleError(e as never)),
    });
  }

  return { keys, api, useList, useOne, useCreate, useUpdate, useRemove };
}
