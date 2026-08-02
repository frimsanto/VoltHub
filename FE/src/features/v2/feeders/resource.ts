// VoltHub V2 — Feeders resource (API + hooks + validation).
import { z } from "zod";
import { createResource } from "@/features/v2/createResource";
import type { Feeder, CreateFeeder, UpdateFeeder } from "@/lib/api/v2";
import type { EmbeddedLocation } from "@/features/v2/lookups";

export interface FeederParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  search?: string;
  locationId?: string;
}

// The API embeds the Gardu (location) relation on every feeder row; the
// generated `Feeder` type omits it, so we widen it here for display.
export type FeederWithLocation = Feeder & { location?: EmbeddedLocation | null };

export const feeders = createResource<
  FeederWithLocation,
  FeederWithLocation,
  CreateFeeder,
  UpdateFeeder,
  FeederParams
>({
  key: "v2-feeders",
  path: "/feeders",
  labels: { entity: "Feeder" },
});

// Validation mirrors CreateFeeder (docs/openapi.yaml).
// `feederCode` is omitted: only a name is collected; the backend auto-generates
// the hidden unique code from it.
export const feederSchema = z.object({
  locationId: z.string().min(1, "Lokasi wajib dipilih"),
  feederName: z.string().min(1, "Nama penyulang wajib diisi"),
});

export type FeederFormValues = z.infer<typeof feederSchema>;

export const emptyFeeder: FeederFormValues = {
  locationId: "",
  feederName: "",
};
