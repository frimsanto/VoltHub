// VoltHub — Documents resource.
//
// Backend (BE/src/modules/documents): list/get (any auth), upload (multipart,
// any auth), soft-delete (CRUD roles). Upload is multipart so it can't use the
// generic JSON create — list/get/remove come from the factory, upload is a
// dedicated multipart hook.
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createResource } from "@/features/v2/createResource";
import { v2Upload, handleError } from "@/lib/api/v2";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/v2/enums";
import type { LocationRef, AssetRef } from "@/features/v2/inspections/resource";
import { DOCUMENT_CATEGORIES, CATEGORY_TO_TYPE } from "./categories";

export interface VoltDocument {
  id: string;
  locationId: string | null;
  assetId: string | null;
  documentType: (typeof DOCUMENT_TYPES)[number];
  documentName: string;
  fileUrl: string;
  createdAt?: string;
  createdBy?: string | null;
  updatedAt?: string;
  location?: LocationRef;
  asset?: AssetRef;
}

export interface DocumentParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  search?: string;
  locationId?: string;
  assetId?: string;
  documentType?: string;
}

// Create is multipart (handled by useUploadDocument); the factory's JSON create is
// unused here. list/get/remove use the shared factory.
export const documents = createResource<
  VoltDocument,
  VoltDocument,
  Record<string, never>,
  Record<string, never>,
  DocumentParams
>({
  key: "v2-documents",
  path: "/documents",
  labels: { entity: "Dokumen" },
});

export interface UploadDocumentInput {
  file: File;
  documentType: DocumentType;
  documentName?: string;
  locationId?: string | null;
  assetId?: string | null;
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadDocumentInput) => {
      const form = new FormData();
      form.append("file", input.file);
      form.append("documentType", input.documentType);
      if (input.documentName) form.append("documentName", input.documentName);
      if (input.locationId) form.append("locationId", input.locationId);
      if (input.assetId) form.append("assetId", input.assetId);
      return v2Upload<VoltDocument>("/documents", form);
    },
    onSuccess: () => {
      toast.success("Dokumen diunggah");
      qc.invalidateQueries({ queryKey: documents.keys.lists() });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

// ── Validation (upload form) ──────────────────────────────────────────────────
// Backend requires at least one of locationId / assetId. Enforced via refine.
// The form captures one of the 8 business categories; it is mapped to the
// persisted backend enum (CATEGORY_TO_TYPE) before upload.
export const documentUploadSchema = z
  .object({
    category: z.enum(DOCUMENT_CATEGORIES),
    documentName: z.string().nullish(),
    locationId: z.string().nullish(),
    assetId: z.string().nullish(),
  })
  .refine((d) => !!d.locationId || !!d.assetId, {
    message: "Pilih minimal Gardu atau Aset",
    path: ["locationId"],
  });

export type DocumentUploadValues = z.infer<typeof documentUploadSchema>;
export const emptyDocumentUpload: DocumentUploadValues = {
  category: "LAINNYA",
  documentName: null,
  locationId: null,
  assetId: null,
};

/** Map validated form values → the upload mutation input (resolves enum). */
export function toUploadInput(values: DocumentUploadValues, file: File): UploadDocumentInput {
  return {
    file,
    documentType: CATEGORY_TO_TYPE[values.category],
    documentName: values.documentName ?? undefined,
    locationId: values.locationId ?? undefined,
    assetId: values.assetId ?? undefined,
  };
}
