// VoltHub — Real-time INS/OOP dashboard data hooks.
//
// Backed by the SCADA availability registry (`scada_gardu`), fed from the
// Laporan Gardu RC/GH/GI reports. The headline dashboard scopes to RC — the
// population the control room actively polls — and polls on an interval so the
// IN-SCAN vs OOP split reflects the latest imported state.
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { v2Get } from "@/lib/api/v2";
import type { ApiResponse } from "@/lib/api/client";
import apiClient from "@/lib/api/client";

export type ScadaType = "RC" | "GH" | "GI" | "GFD";

export interface StatusCounts {
  total: number;
  inScan: number;
  oop: number;
  unknown: number;
}

export interface ScadaSummary extends StatusCounts {
  type: ScadaType;
  avaAvg: number | null;
  asOfDate: string | null;
  dimension: "rtupp" | "wilayah";
  breakdown: (StatusCounts & { name: string })[];
}

export interface ScadaTypeTotal extends StatusCounts {
  type: ScadaType;
}

export interface ScadaGarduRow {
  id: string;
  code: string;
  up3: string | null;
  rtupp: string | null;
  wilayah: string | null;
  avaYtd: number | null;
  currentValue: number | null;
  currentStatus: "IN_SCAN" | "OOP" | null;
  asOfDate: string | null;
}

/** Headline INS/OOP summary for one gardu type. Polls every 30s by default. */
export function useScadaSummary(type: ScadaType = "RC", refetchInterval = 30_000) {
  return useQuery<ScadaSummary>({
    queryKey: ["scada-realtime-summary", type],
    queryFn: () => v2Get<ScadaSummary>(`/scada-realtime/summary?type=${type}`),
    refetchInterval,
    staleTime: 0,
  });
}

/** Per-type totals (RC/GH/GI/GFD) for the overview strip. */
export function useScadaTypes(refetchInterval = 30_000) {
  return useQuery<ScadaTypeTotal[]>({
    queryKey: ["scada-realtime-types"],
    queryFn: () => v2Get<ScadaTypeTotal[]>("/scada-realtime/types"),
    refetchInterval,
    staleTime: 0,
  });
}

export interface GarduListParams {
  type: ScadaType;
  status?: "IN_SCAN" | "OOP";
  search?: string;
  rtupp?: string;
  page?: number;
  limit?: number;
}

export interface PagedGardu {
  items: ScadaGarduRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Paginated gardu drill-down (OOP list, search, etc.). */
export function useScadaGardu(params: GarduListParams) {
  const qs = new URLSearchParams();
  qs.set("type", params.type);
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.rtupp) qs.set("rtupp", params.rtupp);
  qs.set("page", String(params.page ?? 1));
  qs.set("limit", String(params.limit ?? 50));

  return useQuery<PagedGardu>({
    queryKey: ["scada-realtime-gardu", params],
    // The gardu list returns rows in `data` and pagination in `meta`, so read the
    // raw envelope here instead of v2Get (which only unwraps `data`).
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ScadaGarduRow[]>>(
        `/v1/scada-realtime/gardu?${qs.toString()}`,
      );
      const body = res.data;
      const m = body.meta ?? {};
      return {
        items: body.data ?? [],
        meta: {
          page: m.page ?? params.page ?? 1,
          limit: m.limit ?? params.limit ?? 50,
          total: m.total ?? 0,
          totalPages: m.totalPages ?? 0,
        },
      };
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}
