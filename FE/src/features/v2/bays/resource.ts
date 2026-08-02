// VoltHub — Bay resource (GI → Bay master data).
// Backend (BE/src/modules/bays): list/get (any auth, RTUPP-scoped),
// create/update/delete (WRITE_ROLES = MASTER, ADMIN). Bay only on GI locations.
import { z } from "zod";
import { useMemo } from "react";
import { createResource } from "@/features/v2/createResource";
import type { SelectOption } from "@/components/v2/fields";
import type { LocationRef } from "@/features/v2/inspections/resource";

export interface Bay {
  id: string;
  locationId: string;
  code: string;
  name: string;
  voltageLevel: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  location?: LocationRef;
}

export interface BayParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  search?: string;
  locationId?: string;
  isActive?: boolean;
}

export interface CreateBay {
  locationId: string;
  code: string;
  name: string;
  voltageLevel?: string | null;
  isActive?: boolean;
}

export type UpdateBay = Partial<Omit<CreateBay, "locationId">>;

export const bays = createResource<Bay, Bay, CreateBay, UpdateBay, BayParams>({
  key: "v2-bays",
  path: "/bays",
  labels: { entity: "Bay" },
});

/** Bay options for a given GI (empty until a GI is selected). */
export function useBayOptions(locationId?: string): { options: SelectOption[]; isLoading: boolean } {
  const q = bays.useList({ page: 1, limit: 100, locationId }, { enabled: !!locationId });
  const options = useMemo(
    () =>
      (q.data?.items ?? []).map((b) => ({
        value: b.id,
        label: b.voltageLevel ? `${b.name} (${b.voltageLevel})` : b.name,
      })),
    [q.data],
  );
  return { options, isLoading: q.isLoading };
}

export const baySchema = z.object({
  locationId: z.string().min(1, "GI wajib dipilih"),
  code: z.string().min(1, "Kode bay wajib diisi").max(50),
  name: z.string().min(1, "Nama bay wajib diisi").max(255),
  voltageLevel: z.string().max(50).nullish(),
  isActive: z.boolean().optional(),
});

export type BayFormValues = z.infer<typeof baySchema>;

export const emptyBay: BayFormValues = {
  locationId: "",
  code: "",
  name: "",
  voltageLevel: "",
  isActive: true,
};
