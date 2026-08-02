// VoltHub V2 — Locations resource (API + hooks + validation).
import { z } from "zod";
import { createResource } from "@/features/v2/createResource";
import { LOCATION_TYPES } from "@/lib/v2/enums";
import type { Location, CreateLocation, UpdateLocation } from "@/lib/api/v2";

export interface LocationParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
}

export const locations = createResource<
  Location,
  Location,
  CreateLocation,
  UpdateLocation,
  LocationParams
>({ key: "v2-locations", path: "/locations", labels: { entity: "Location" } });

// Validation mirrors CreateLocation (docs/openapi.yaml).
// `code` is intentionally omitted: the UI collects only a name; the backend
// auto-generates the (hidden) unique code from it.
export const locationSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  locationType: z.enum(LOCATION_TYPES),
  up3: z.string().nullish(),
  address: z.string().nullish(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  status: z.boolean(),
});

export type LocationFormValues = z.infer<typeof locationSchema>;

export const emptyLocation: LocationFormValues = {
  name: "",
  locationType: "GI",
  up3: null,
  address: null,
  latitude: null,
  longitude: null,
  status: true,
};
