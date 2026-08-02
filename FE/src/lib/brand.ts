// VoltHub brand identity (single source of truth for user-facing app naming).
// Applied to the UI: login, sidebar, dashboard, browser title.
// Technical identifiers are intentionally NOT renamed to avoid breaking changes:
// the package name "voltreport", import paths, localStorage/IndexedDB keys,
// native appId, and database/API contracts all stay as-is.

export const BRAND_NAME = "VoltHub";
export const BRAND_SUBTITLE = "Telecommunication Asset Management System";
export const BRAND_TITLE = `${BRAND_NAME} — ${BRAND_SUBTITLE}`;
