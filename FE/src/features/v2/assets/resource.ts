// VoltHub V2 — Assets resource (API + hooks + validation).
import { z } from "zod";
import { createResource } from "@/features/v2/createResource";
import { ASSET_TYPES, ASSET_STATUSES } from "@/lib/v2/enums";
import type { Asset, CreateAsset, UpdateAsset } from "@/lib/api/v2";
import type { EmbeddedLocation } from "@/features/v2/lookups";

export interface AssetParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  search?: string;
  assetType?: string;
  locationId?: string;
  status?: string;
}

// The API embeds the Gardu (location) and Penyulang (feeder) relations on every
// asset row; the generated `Asset` type omits them, so we widen it for display.
export type AssetWithRelations = Asset & {
  location?: EmbeddedLocation | null;
  feeder?: { id?: string; feederCode?: string | null; feederName?: string | null } | null;
};

export const assets = createResource<
  AssetWithRelations,
  CreateAsset,
  CreateAsset,
  UpdateAsset,
  AssetParams
>({
  key: "v2-assets",
  path: "/assets",
  labels: { entity: "Asset" },
});

// Validation mirrors CreateAsset (docs/openapi.yaml). PUT replaces the full
// resource (UpdateAsset = CreateAsset), so edits must load full detail first.
const optionalText = z.string().nullish();

export const assetSchema = z.object({
  locationId: z.string().min(1, "Lokasi wajib dipilih"),
  feederId: z.string().nullish(),
  parentAssetId: z.string().nullish(),
  assetType: z.enum(ASSET_TYPES),
  // assetCode omitted — backend auto-generates the hidden unique code from assetName.
  assetName: z.string().min(1, "Nama aset wajib diisi"),
  brand: optionalText,
  model: optionalText,
  serialNumber: optionalText,
  tahunOperasi: z.number().int().nullish(),
  status: z.enum(ASSET_STATUSES).optional(),
  notes: optionalText,
  protocol: optionalText,
  asdu: optionalText,
  linkAddress: optionalText,
  pairChannel: optionalText,
  masterIp1: optionalText,
  masterIp2: optionalText,
  batteryCount: z.number().int().nullish(),
  capacity: optionalText,
});

export type AssetFormValues = z.infer<typeof assetSchema>;

export const emptyAsset: AssetFormValues = {
  locationId: "",
  feederId: null,
  parentAssetId: null,
  assetType: "RTU",
  assetName: "",
  brand: null,
  model: null,
  serialNumber: null,
  tahunOperasi: null,
  status: "ACTIVE",
  notes: null,
  protocol: null,
  asdu: null,
  linkAddress: null,
  pairChannel: null,
  masterIp1: null,
  masterIp2: null,
  batteryCount: null,
  capacity: null,
};
