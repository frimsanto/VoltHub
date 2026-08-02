// VoltHub V2 — Convenience type aliases over the generated OpenAPI schemas.
//
// `types.gen.ts` is the source of truth (regenerate with `npm run gen:api`).
// This file only re-aliases `components["schemas"][...]` into flat names so
// feature code reads cleanly: `import type { Location } from "@/lib/api/v2"`.
// Do not hand-edit shapes here — change the OpenAPI contract + regenerate.

import type { components } from "./types.gen";

export type Schemas = components["schemas"];

// Master Data
export type Location = Schemas["Location"];
export type CreateLocation = Schemas["CreateLocation"];
export type UpdateLocation = Schemas["UpdateLocation"];

export type Feeder = Schemas["Feeder"];
export type CreateFeeder = Schemas["CreateFeeder"];
export type UpdateFeeder = Schemas["UpdateFeeder"];

export type Asset = Schemas["Asset"];
export type CreateAsset = Schemas["CreateAsset"];
export type UpdateAsset = Schemas["UpdateAsset"];

export type SimCard = Schemas["SimCard"];
export type CreateSimCard = Schemas["CreateSimCard"];
export type UpdateSimCard = Schemas["UpdateSimCard"];

export type CommunicationMedia = Schemas["CommunicationMedia"];
export type CreateCommunicationMedia = Schemas["CreateCommunicationMedia"];
export type UpdateCommunicationMedia = Schemas["UpdateCommunicationMedia"];

// Operations
export type CreateInspection = Schemas["CreateInspection"];
export type CreateFinding = Schemas["CreateFinding"];

export type CreateHarReport = Schemas["CreateHarReport"];
export type CreateHarDetail = Schemas["CreateHarDetail"];
export type UpdateHarDetail = Schemas["UpdateHarDetail"];

// Reports
export type GenerateInspectionReport = Schemas["GenerateInspectionReport"];
export type GenerateHarReport = Schemas["GenerateHarReport"];
