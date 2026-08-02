// VoltHub — Inspections resource (API + hooks + validation).
//
// Backend (BE/src/modules/inspections): list/get/create inspection; nested
// add-finding (POST /inspections/:id/findings) and add-photo (multipart,
// POST /findings/:id/photos). Inspections have no update/delete endpoint
// (transactional records), so only useList/useOne/useCreate are used.
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createResource } from "@/features/v2/createResource";
import { v2Post, v2Upload, handleError } from "@/lib/api/v2";
import { INSPECTION_STATUSES } from "@/lib/v2/enums";
import type { CreateInspection, CreateFinding } from "@/lib/api/v2";

// ── Response shapes (not in the generated contract; mirror repository includes) ──
export interface LocationRef {
  id: string;
  code?: string | null;
  name?: string | null;
  locationType?: string | null;
}
export interface UserRef {
  id: string;
  name?: string | null;
  email?: string | null;
}
export interface AssetRef {
  id: string;
  assetCode?: string | null;
  assetName?: string | null;
  assetType?: string | null;
}

export interface InspectionPhoto {
  id: string;
  findingId: string;
  assetId: string;
  photoUrl: string;
  caption: string | null;
}

export interface InspectionFinding {
  id: string;
  inspectionId: string;
  assetId: string;
  status: (typeof INSPECTION_STATUSES)[number];
  finding: string | null;
  recommendation: string | null;
  asset?: AssetRef;
  photos?: InspectionPhoto[];
}

export interface Inspection {
  id: string;
  locationId: string;
  inspectionDate: string;
  notes: string | null;
  location?: LocationRef;
  inspector?: UserRef;
  createdAt?: string;
  _count?: { findings: number };
}

export interface InspectionDetail extends Inspection {
  findings: InspectionFinding[];
}

export interface InspectionParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  locationId?: string;
  search?: string;
  /** Inclusive inspection-date range (YYYY-MM-DD). */
  dateFrom?: string;
  dateTo?: string;
}

export const inspections = createResource<
  Inspection,
  InspectionDetail,
  CreateInspection,
  CreateInspection,
  InspectionParams
>({
  key: "v2-inspections",
  path: "/inspections",
  labels: { entity: "Inspeksi" },
});

// ── Findings (nested) ─────────────────────────────────────────────────────────
export function useAddFinding(inspectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFinding) =>
      v2Post<InspectionFinding, CreateFinding>(`/inspections/${inspectionId}/findings`, body),
    onSuccess: () => {
      toast.success("Temuan ditambahkan");
      qc.invalidateQueries({ queryKey: inspections.keys.detail(inspectionId) });
      qc.invalidateQueries({ queryKey: inspections.keys.lists() });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

// ── Photos (multipart, by finding id) ────────────────────────────────────────
export function useAddFindingPhoto(inspectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, file, caption }: { findingId: string; file: File; caption?: string }) => {
      const form = new FormData();
      form.append("photo", file);
      if (caption) form.append("caption", caption);
      return v2Upload<InspectionPhoto>(`/findings/${findingId}/photos`, form);
    },
    onSuccess: () => {
      toast.success("Foto diunggah");
      qc.invalidateQueries({ queryKey: inspections.keys.detail(inspectionId) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

// ── Validation ────────────────────────────────────────────────────────────────
export const inspectionSchema = z.object({
  locationId: z.string().min(1, "Lokasi wajib dipilih"),
  inspectionDate: z.string().min(1, "Tanggal inspeksi wajib diisi"),
  notes: z.string().nullish(),
});
export type InspectionFormValues = z.infer<typeof inspectionSchema>;
export const emptyInspection: InspectionFormValues = {
  locationId: "",
  inspectionDate: new Date().toISOString().slice(0, 10),
  notes: null,
};

export const findingSchema = z.object({
  assetId: z.string().min(1, "Aset wajib dipilih"),
  status: z.enum(INSPECTION_STATUSES),
  finding: z.string().nullish(),
  recommendation: z.string().nullish(),
});
export type FindingFormValues = z.infer<typeof findingSchema>;
export const emptyFinding: FindingFormValues = {
  assetId: "",
  status: "NORMAL",
  finding: null,
  recommendation: null,
};
