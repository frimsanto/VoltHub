// VoltHub V2 — API layer barrel.
// One import surface for the V2 (Asset Management) domain.
//
//   import { v2Get, v2List, type Location } from "@/lib/api/v2";
//
// Resource clients (locations.ts, feeders.ts, …) land here in Phase 2+ and will
// be re-exported below. Phase 0 ships the typed core only — no business clients.

export * from "./client";
export * from "./schemas";
