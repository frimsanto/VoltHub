# GIS Monitoring Module

Geospatial monitoring for VoltHub. Visualizes operational assets on an
interactive map — **gardu, penyulang, assets, inspections, work orders, and
team positions** — built **entirely from existing location data**. No new
tables, no schema migration, no mock coordinates.

> **Single source of truth: `locations.latitude` / `locations.longitude`.**
> Every operational entity in the V2 model hangs off a `Location` (a Site):
> assets, feeders (penyulang), inspections and tickets (work orders) all carry a
> `locationId`. The GIS module therefore anchors everything to the site point
> and enriches it with per-entity aggregates. Teams have no coordinate column,
> so their position is *derived* (see §4.6).

---

## 1. At a glance

| Concern | Decision |
|---|---|
| Geometry source | `locations.latitude/longitude` (`Decimal(10,7)`), the only geocoded table |
| Wire format | **RFC 7946 GeoJSON**, coordinates as `[lng, lat]` |
| Map engine | **Leaflet** + **react-leaflet v5** (React 19), OpenStreetMap raster tiles (no API key) |
| Clustering | Client-side `leaflet.markercluster` (zoom ≥ 7) **+** server-side grid clustering (zoom < 7) |
| Heatmap | `leaflet.heat`, weight from a selectable metric |
| Backend | New module `BE/src/modules/gis`, mounted at `/api/v1/gis` |
| RBAC | Read-only; all authenticated roles at the API. UI nav exposed to ADMIN + SUPERADMIN |
| New endpoints | 6 (`/layers`, `/features`, `/teams`, `/heatmap`, `/clusters`, `/locations/:id`) |

---

## 2. Layers

| Layer | id | Source | Marker / encoding |
|---|---|---|---|
| **Gardu** | `gardu` | `locations` where `locationType ∈ {GI, GH, GARDU}` | Colored circle, color = derived health |
| **Penyulang** | `penyulang` | `feeders` (anchored at parent location) | Site flagged when `feederCount > 0` |
| **Asset** | `asset` | `assets` per location | Site flagged when `assetCount > 0` |
| **Inspection** | `inspection` | `inspections` per location | Site flagged when it has any inspection |
| **Work Order** (Reports) | `report` | `tickets` (open) per location | Site emphasized when `openTickets > 0` |
| **Team Location** | `team` | Derived: latest inspection per active team | Distinct ◎ marker at last-seen site |

Gardu / Penyulang / Asset / Inspection / Report all share the **same site
substrate** (`/gis/features`): one request returns every on-screen site with all
per-layer aggregates, and the client toggles layers by filtering on the
`properties.layers[]` flags — **no refetch per toggle**. Only `team` (a different
geometry derivation) is a separate request.

> **Why Penyulang is a point, not a line.** Feeders model an electrical line but
> the schema stores no line geometry for them — only a `locationId`. So a feeder
> is rendered at its home site. The reserved `site_geometries` table
> (`geometry LONGTEXT`, GeoJSON/WKT) is the forward path for true feeder polylines
> and gardu boundary polygons; see §8.

---

## 3. Backend API (`/api/v1/gis`)

All endpoints require a valid bearer token (`authenticate`). They are read-only.

### 3.1 `GET /layers`
Layer catalog with **live counts** and the overall bounding box (used to fit the
map on first load).
```jsonc
{
  "layers": [
    { "id": "gardu", "label": "Gardu", "geometry": "point", "count": 1280 },
    { "id": "report", "label": "Work Order", "geometry": "point", "count": 47 }
    // …penyulang, asset, inspection, team
  ],
  "bbox": [105.1, -8.2, 114.6, -5.9],   // [minLng, minLat, maxLng, maxLat]
  "generatedAt": "2026-06-05T12:00:00.000Z"
}
```

### 3.2 `GET /features`
The core map endpoint — the site substrate as a GeoJSON `FeatureCollection`.

| Query | Type | Notes |
|---|---|---|
| `bbox` | `minLng,minLat,maxLng,maxLat` | Viewport rectangle — **pushed to SQL** |
| `layers` | csv of layer ids | Default all; a site is returned only if it belongs to ≥1 requested layer |
| `type` | `GI \| GH \| GARDU` | Optional site-type filter |
| `up3` | string | Optional UP3 filter |
| `search` | string | Matches `name` or `code` (`LIKE`) |
| `openTickets` | bool | Only sites with an open work order |
| `limit` | int (≤5000, default 2000) | Hard cap; `meta.truncated` flags overflow |

```jsonc
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": { "type": "Point", "coordinates": [110.41, -7.02] },
    "properties": {
      "id": "…", "code": "GD-001", "name": "Gardu Kota", "locationType": "GARDU",
      "up3": "UP3 Semarang", "health": "WARNING",
      "assetCount": 12, "activeAssetCount": 11, "faultyAssetCount": 1,
      "feederCount": 3, "openTickets": 2, "criticalTickets": 0,
      "lastInspectionDate": "2026-05-30T00:00:00.000Z",
      "layers": ["gardu", "penyulang", "asset", "inspection", "report"]
    }
  }],
  "meta": { "count": 1, "truncated": false, "layers": ["gardu","report"], "generatedAt": "…" }
}
```

### 3.3 `GET /teams`
Derived team last-known positions (GeoJSON). Properties: `teamName`, `teamCode`,
`locationId`, `locationName`, `lastSeen`.

### 3.4 `GET /heatmap`
Weighted density points for the heat layer.

| Query | Values | Weight |
|---|---|---|
| `metric` | `tickets` (default) | open work orders per site |
| | `assets` | asset count per site |
| | `inspections` | inspection count per site |
| | `sites` | uniform (pure location density) |

Returns `{ metric, max, points: [[lng,lat,weight], …], generatedAt }`.

### 3.5 `GET /clusters`
**Server-side** grid clustering for low-zoom views (see §6). Query: `bbox`,
`type`, `up3`, `zoom` (0–22). The cell size is derived from `zoom`
(`360 / 2^zoom / 4` degrees) so cluster granularity tracks the tile pyramid.
Returns `{ zoom, cellDeg, clusters: [{ coordinates:[lng,lat], count }], … }`.

### 3.6 `GET /locations/:id`
Detail-popup payload for one site: health, `feeders[]`, `assetsByType[]`,
`openTickets[]`, `recentInspections[]` (worst finding status per inspection).

---

## 4. Health & semantics

### 4.1 Derived site health
Computed in the service from already-aggregated counts (most severe wins):

| Health | Condition | Color |
|---|---|---|
| `OFFLINE` | `locations.status = false` | gray `#6b7280` |
| `CRITICAL` | any `CRITICAL` open ticket **or** any `DAMAGED`/`WARNING` asset | red `#dc2626` |
| `WARNING` | any open ticket | amber `#f59e0b` |
| `NORMAL` | otherwise | green `#16a34a` |

### 4.6 Team position derivation
Teams carry no coordinates. Each **active** team is placed at the location of its
**most recent inspection** (by any member: `inspection.inspectorId → users.teamId`).
This is an operational footprint ("last seen"), documented as such in the UI.
When real-time team GPS lands (Capacitor geolocation, see §8), this layer swaps
its source with no client change.

---

## 5. Frontend

```
FE/src/features/v2/gis/
  api.ts                 # typed react-query hooks (one per endpoint)
  style.ts               # health colors, layer metadata, Leaflet divIcon factories
  layers.tsx             # imperative plugin layers: SiteCluster, Heat, Team, GridCluster, ViewportWatcher
  GisMap.tsx             # MapContainer orchestrator: viewport state + zoom-based layer switching
  GisLayerControl.tsx    # floating control panel: layer toggles, heatmap, search, legend
  SiteDetailPanel.tsx    # detail "popup" (rich side panel) for a selected site
  leaflet-plugins.d.ts   # local typings for leaflet.heat
FE/src/routes/_app.gis.tsx   # /gis route (ADMIN + SUPERADMIN), owns filter state
```

- **Data flow** mirrors the project standard: Page (`_app.gis.tsx`) → Feature
  component (`GisMap`) → API hooks (`api.ts`) → shared V2 client (`v2Get`).
- **Plugins** (`leaflet.markercluster`, `leaflet.heat`) have no first-class
  react-leaflet wrapper, so each is managed imperatively inside a `useMap()`
  child that owns a single plugin layer across its lifecycle — version-proof and
  avoids per-marker React reconciliation.
- **Markers are CSS `divIcon`s** (colored circles), so there are no Leaflet
  image-marker assets to bundle and health is encoded by color.
- **Interactions:** click a marker → lazy `GET /locations/:id` → side panel.
  Hover → tooltip (`code — name`). Click a low-zoom grid cluster → fly-in.

### Layer controls
`GisLayerControl` is fully controlled by the route state (the single source of
truth): per-layer switches with live counts, a heatmap toggle + metric selector,
a debounced search box, and a status legend.

---

## 6. Optimizing large datasets

The map is designed to stay responsive from a single gardu up to nation-scale
location counts. Five compounding techniques:

1. **Viewport-bounded fetch.** `bbox` is a SQL range predicate on
   `(latitude, longitude)`; the client only ever downloads on-screen sites and
   re-fetches (debounced 300 ms) on `moveend`/`zoomend`.
2. **Zoom-based rendering switch.** Below zoom 7 the client calls `/clusters`,
   which aggregates in MySQL (`GROUP BY ROUND(lat/cell), ROUND(lng/cell)`). The
   payload is bounded by *occupied grid cells*, not site count — a
   "whole of Indonesia" view stays tiny regardless of dataset size. At zoom ≥ 7
   it fetches individual features and clusters them client-side with
   `markercluster` (`chunkedLoading` → no UI freeze).
3. **One aggregation pass, no N+1.** Each site's asset/feeder/ticket/inspection
   aggregates are computed with `LEFT JOIN` + conditional `COUNT` in a single
   grouped query — never a per-marker round trip.
4. **Hard cap + truncation flag.** `/features` caps at `limit` (default 2000) and
   returns `meta.truncated` so the UI can prompt the user to zoom/filter.
5. **Client cache + no-flicker panning.** react-query `staleTime` (30 s) +
   `keepPreviousData` keep the previous markers on screen while the next bbox
   loads.

### Recommended index
The bbox predicate is a range scan today. For large tables add a composite index
to let MySQL range-scan latitude then filter longitude:
```sql
CREATE INDEX idx_locations_geo ON locations (latitude, longitude);
```
(Additive, non-breaking; the module works without it.) A future hard-scale step
is migrating `latitude/longitude` to a MySQL `POINT` column with a `SPATIAL`
index and `MBRContains(bbox, pt)` — see §8.

---

## 7. RBAC

GIS is a **read-only visualization of existing operational data**. The API grants
read to every authenticated role (mirrors the `locations` read policy); there is
no write surface. The sidebar entry and route guard expose it to **ADMIN +
SUPERADMIN**, consistent with the other operational monitoring tools (KPI,
Operations Monitoring). UP3-level scoping is available via the `up3` query
parameter and can be wired to an ADMIN's UP3 if/when that link is enforced.

---

## 8. Future / not in scope

- **True line/polygon geometry** for penyulang feeders and gardu boundaries via
  the reserved `site_geometries` table (GeoJSON/WKT already supported by schema).
- **MySQL spatial column** (`POINT` + `SPATIAL` index, `MBRContains`) for
  sub-millisecond bbox queries at extreme scale.
- **Real-time team GPS** (Capacitor `@capacitor/geolocation`) replacing the
  derived team-position source in §4.6, streamed over the existing notification
  channel.
- **Telemetry overlay** from the reserved `telemetry_points` / `telemetry_values`
  tables (SCADA/IoT live values on the map).
- **OpenAPI registration:** the 6 GIS paths are documented here; adding them to
  the hand-maintained `BE/src/config/swagger.ts` is a follow-up.

---

## 9. File manifest

**Backend** (`BE/src/modules/gis/`): `gis.validation.ts`, `gis.dto.ts`,
`gis.repository.ts`, `gis.service.ts`, `gis.controller.ts`, `gis.routes.ts`;
mounted in `BE/src/routes/index.ts` at `/api/v1/gis`.

**Frontend** (`FE/src/features/v2/gis/` + `FE/src/routes/_app.gis.tsx`): see §5.
Nav entry added in `FE/src/lib/v2/nav.ts`. New deps: `leaflet`,
`react-leaflet`, `leaflet.markercluster`, `leaflet.heat` (+ `@types/*`).
