// VoltHub V2 — Communication Media resource (API + hooks + validation).
import { z } from "zod";
import { createResource } from "@/features/v2/createResource";
import { MEDIA_TYPES } from "@/lib/v2/enums";
import type {
  CommunicationMedia,
  CreateCommunicationMedia,
  UpdateCommunicationMedia,
} from "@/lib/api/v2";
import type { EmbeddedLocation } from "@/features/v2/lookups";

export interface CommMediaParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  search?: string;
  locationId?: string;
  mediaType?: string;
}

// The API embeds the Gardu (location) relation on every row; the generated type
// omits it, so we widen it for display.
export type CommMediaWithLocation = CommunicationMedia & { location?: EmbeddedLocation | null };

export const commMedia = createResource<
  CommMediaWithLocation,
  CommMediaWithLocation,
  CreateCommunicationMedia,
  UpdateCommunicationMedia,
  CommMediaParams
>({
  key: "v2-comm-media",
  path: "/communication-media",
  labels: { entity: "Communication Media" },
});

// Validation mirrors CreateCommunicationMedia (docs/openapi.yaml).
export const commMediaSchema = z.object({
  locationId: z.string().min(1, "Lokasi wajib dipilih"),
  mediaType: z.enum(MEDIA_TYPES),
  provider: z.string().nullish(),
  status: z.boolean(),
  notes: z.string().nullish(),
});

export type CommMediaFormValues = z.infer<typeof commMediaSchema>;

export const emptyCommMedia: CommMediaFormValues = {
  locationId: "",
  mediaType: "GSM_4G",
  provider: null,
  status: true,
  notes: null,
};
