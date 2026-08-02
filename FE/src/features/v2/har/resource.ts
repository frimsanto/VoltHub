// VoltHub — HAR (Hasil Analisa & Rekomendasi) resource.
//
// Backend (BE/src/modules/har): list/get/create report; nested details
// add (any auth) / update / delete (CRUD roles). Reports themselves have no
// update/delete endpoint.
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createResource } from "@/features/v2/createResource";
import { v2Post, v2Put, v2Delete, handleError } from "@/lib/api/v2";
import { HAR_STATUSES } from "@/lib/v2/enums";
import type { CreateHarReport, CreateHarDetail, UpdateHarDetail } from "@/lib/api/v2";
import type { LocationRef, AssetRef } from "@/features/v2/inspections/resource";

export interface HarDetail {
  id: string;
  harReportId: string;
  assetId: string;
  status: (typeof HAR_STATUSES)[number];
  analysis: string | null;
  notes: string | null;
  asset?: AssetRef;
}

export interface HarReport {
  id: string;
  locationId: string;
  reportDate: string;
  location?: LocationRef;
  createdAt?: string;
  _count?: { details: number };
}

export interface HarReportDetail extends HarReport {
  details: HarDetail[];
}

export interface HarParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  locationId?: string;
}

export const harReports = createResource<
  HarReport,
  HarReportDetail,
  CreateHarReport,
  CreateHarReport,
  HarParams
>({
  key: "v2-har",
  path: "/har-reports",
  labels: { entity: "HAR" },
});

// ── Details (nested) ──────────────────────────────────────────────────────────
export function useAddHarDetail(harReportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateHarDetail) =>
      v2Post<HarDetail, CreateHarDetail>(`/har-reports/${harReportId}/details`, body),
    onSuccess: () => {
      toast.success("Detail HAR ditambahkan");
      qc.invalidateQueries({ queryKey: harReports.keys.detail(harReportId) });
      qc.invalidateQueries({ queryKey: harReports.keys.lists() });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

export function useUpdateHarDetail(harReportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ detailId, body }: { detailId: string; body: UpdateHarDetail }) =>
      v2Put<HarDetail, UpdateHarDetail>(`/har-reports/${harReportId}/details/${detailId}`, body),
    onSuccess: () => {
      toast.success("Detail HAR diperbarui");
      qc.invalidateQueries({ queryKey: harReports.keys.detail(harReportId) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

export function useDeleteHarDetail(harReportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (detailId: string) => v2Delete(`/har-reports/${harReportId}/details/${detailId}`),
    onSuccess: () => {
      toast.success("Detail HAR dihapus");
      qc.invalidateQueries({ queryKey: harReports.keys.detail(harReportId) });
      qc.invalidateQueries({ queryKey: harReports.keys.lists() });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

// ── Validation ────────────────────────────────────────────────────────────────
export const harReportSchema = z.object({
  locationId: z.string().min(1, "Lokasi wajib dipilih"),
  reportDate: z.string().min(1, "Tanggal laporan wajib diisi"),
});
export type HarReportFormValues = z.infer<typeof harReportSchema>;
export const emptyHarReport: HarReportFormValues = {
  locationId: "",
  reportDate: new Date().toISOString().slice(0, 10),
};

export const harDetailSchema = z.object({
  assetId: z.string().min(1, "Aset wajib dipilih"),
  status: z.enum(HAR_STATUSES),
  analysis: z.string().nullish(),
  notes: z.string().nullish(),
});
export type HarDetailFormValues = z.infer<typeof harDetailSchema>;
export const emptyHarDetail: HarDetailFormValues = {
  assetId: "",
  status: "NORMAL",
  analysis: null,
  notes: null,
};
