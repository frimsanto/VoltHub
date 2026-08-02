# VoltHub — Production Readiness Audit

**Date:** 2026-06-06
**Scope:** Full-stack audit of the VoltHub codebase (Backend `BE/`, Frontend `FE/`, Executive Portal `portal/`) ahead of UAT and production deployment.
**Type:** Read-only audit. No code was modified.
**Verdict:** **NOT production-ready as-is.** One critical authorization gap and several high-priority data-integrity / security issues must be resolved before UAT sign-off. The core platform (auth, JWT rotation, validation, modular structure, offline sync) is otherwise well-engineered.

---

## How to read this document

Issues are grouped by severity. Each issue lists **Description**, **Impact**, **Suggested Fix**, and **Affected Files**. Severity reflects production risk:

- **Critical** — security/data exposure or data loss; a deployment blocker.
- **High** — significant correctness, security, or integrity risk; fix before UAT.
- **Medium** — degrades reliability, security posture, or maintainability; fix before GA.
- **Low** — hygiene, polish, and hardening; schedule post-launch.

---

## Summary Table

| # | Severity | Area | Title |
|---|----------|------|-------|
| C-1 | Critical | Backend / RBAC | No RTUPP/UP3 row-level tenant scoping in the V2 domain |
| H-1 | High | Backend / Integrity | `X-Idempotency-Key` ignored — offline replay creates duplicates |
| H-2 | High | Backend / Security | Stored-XSS / MIME confusion via attachment preview (no `nosniff`) |
| H-3 | High | Backend / Security | Long-lived access tokens + tokens in `localStorage`, no access-token revocation |
| H-4 | High | Backend / Audit | Audit trail not written for most V2 mutations |
| H-5 | High | Backend / Performance | Synchronous in-request Excel imports block the event loop |
| M-1 | Medium | Portal / Auth | Portal discards refresh token; no token refresh or 401 handling |
| M-2 | Medium | Backend / Uploads | File filter trusts client MIME; permissive types; no magic-byte check |
| M-3 | Medium | Backend / DoS | 50 MB JSON/body limits enable memory exhaustion |
| M-4 | Medium | Backend / Performance | Heavy multi-join KPI/GIS aggregates without verified indexes |
| M-5 | Medium | Backend / Auth | Login lockout is in-process & in-memory (bypassable when scaled) |
| M-6 | Medium | Frontend / RBAC | Two parallel role-guard systems; risk of drift |
| M-7 | Medium | Backend / Ops | Notification queue runs in-process per instance |
| M-8 | Medium | Backend / Validation | Weak password policy (min 6, no complexity) |
| L-1 | Low | Backend / Ops | Health check does not verify DB connectivity |
| L-2 | Low | Backend / Security | Swagger UI publicly exposed in all environments |
| L-3 | Low | Backend / Logging | `console.*` used instead of structured logger in controllers |
| L-4 | Low | Frontend / Hygiene | `.bak` route files committed as dead code |
| L-5 | Low | Backend / Config | Dev `.env` with placeholder secrets present on disk |
| L-6 | Low | Backend / Caching | `/uploads` served without cache headers or rate limit |

---

## Critical Issues

### C-1 — No RTUPP/UP3 row-level tenant scoping across the entire V2 (Asset Management) domain

**Description.**
Authorization in the V2 modules is **role-gated only**, never **row-scoped**. Read endpoints (`GET /v1/assets`, `/v1/locations`, `/v1/feeders`, `/v1/inspections`, `/v1/har-reports`, `/v1/tickets`, `/v1/documents`, `/v1/performance`, `/v1/gis/*`) are open to *any authenticated user* and return the **global** dataset. Write endpoints require `ADMIN`/`SUPER_ADMIN` but apply no ownership/RTUPP filter, so **any ADMIN can read and mutate another RTUPP's records**.

The service layer confirms this: `AssetService.list()` passes the query straight to the repository with no tenant predicate, and no V2 controller derives a scope from `req.user` except KPI and Workflow. Meanwhile the **KPI service does scope by RTUPP** (`resolveScope()` → `GLOBAL` for super admin, own-RTUPP for admin), and the V1 laporan/upload controllers enforce per-owner access. The result is an **inconsistent and contradictory authorization model**: the documented intent (memory + `docs/07_PERMISSION_MATRIX.md`: "ADMIN manages own RTUPP") is enforced for KPI/laporan but not for the asset domain.

This also produces a concrete **cross-region data leak in the Executive Portal**: the portal shows a Regional Admin an RTUPP-scoped KPI block next to **global** asset counts, GIS layer counts, and performance summary (those endpoints are unscoped), so a UP3 manager sees national asset/network figures they should not.

**Impact.**
- Horizontal privilege escalation / IDOR: an RTUPP admin can view and edit every other RTUPP's gardu, assets, inspections, HAR, tickets, and documents.
- Cross-tenant data exposure to field officers (read) and to regional admins in the portal.
- Audit/compliance failure for a multi-unit PLN deployment where data isolation between UP3/RTUPP is expected.

**Suggested Fix.**
- Introduce a single tenant-scope resolver (mirroring `KpiService.resolveScope`) and apply it in every V2 list/get/update/delete: `SUPER_ADMIN` ⇒ unscoped; `ADMIN` ⇒ filter by their RTUPP/UP3; `PETUGAS` ⇒ their RTUPP (and own records where applicable). Push the predicate into the repository `where` clause and re-check on single-record reads/writes (return 404 for out-of-scope IDs).
- Decide and document the canonical isolation key (RTUPP vs UP3) and ensure `locations`/`assets` carry it (the GIS queries already filter by `l.up3`).
- If global visibility is actually intended for all admins, make that an explicit, documented product decision and align the KPI/laporan scoping to match — today the two models disagree, which is itself the bug.

**Affected Files.**
`BE/src/modules/assets/asset.service.ts`, `asset.repository.ts`, `asset.routes.ts`; `BE/src/modules/locations/*`, `feeders/*`, `inspections/*`, `har/*`, `tickets/*`, `documents/*`, `performance/*`, `gis/gis.repository.ts`, `imports/*`; contrast with `BE/src/modules/kpi/kpi.service.ts` (correct scoping) and `BE/src/controllers/laporanAwalController.ts`; `portal/src/lib/executive/queries.ts` (consumes unscoped endpoints).

---

## High Priority Issues

### H-1 — Backend ignores `X-Idempotency-Key`; offline replay can create duplicate records

**Description.**
The offline-first frontend sends an `X-Idempotency-Key` header on every queued replay and documents the flow as "duplicate-safe" (`FE/src/lib/offline/sync.ts` → `idempotency(item.clientId)`). The backend has **no idempotency handling whatsoever** (a repository-wide search for `idempotency` in `BE/src` returns nothing). The only thing preventing duplicates is database unique constraints, which exist for assets (`assetCode`/`serialNumber` → 409 → parked as conflict) but **not for laporan/inspection submissions**, which have no natural unique business key.

The replay path is specifically vulnerable: if a create succeeds server-side but the network drops before the client receives the response, the item stays `pending` and is retried — creating a second report/inspection.

**Impact.**
Duplicate Laporan Awal/Akhir and inspections from intermittent field connectivity — exactly the conditions VoltHub targets. Corrupts KPI counts, SLA math, and reporting.

**Suggested Fix.**
Implement server-side idempotency: persist `(idempotencyKey, userId) → first response` and short-circuit replays; or add a stable client-generated `clientId` column with a unique index on the report/inspection tables and upsert on it.

**Affected Files.**
`BE/src/middlewares/` (no idempotency middleware exists), `BE/src/controllers/laporanAwalController.ts`, `laporanAkhirController.ts`, `BE/src/modules/inspections/inspection.service.ts`; client side `FE/src/lib/offline/sync.ts`, `FE/src/lib/api/laporanAwal.ts`.

### H-2 — Stored-XSS / MIME confusion via attachment preview endpoint

**Description.**
`previewAttachment` streams a file inline using the **stored (client-influenced) MIME type** and `Content-Disposition: inline` **without** setting `X-Content-Type-Options: nosniff` (grep for `nosniff` in `uploadController.ts` returns nothing). The image upload filters accept any `image/*` (`file.mimetype.startsWith('image/')`), which includes `image/svg+xml`. An SVG (or a sniffed HTML payload) served inline from the application origin executes script in that origin and can exfiltrate the tokens stored in `localStorage` (see H-3).

The static `/uploads` mount is correctly hardened (forces `attachment` + `nosniff`), but the `previewAttachment` controller bypasses that protection.

**Impact.**
Stored XSS → session/token theft → account takeover.

**Suggested Fix.**
On `previewAttachment`: always send `X-Content-Type-Options: nosniff`; restrict inline rendering to a hard allowlist of safe raster types (`image/jpeg|png|webp`) and force `attachment` for everything else; never reflect the client-stored MIME type — derive it from the validated extension. Reject `image/svg+xml` at upload.

**Affected Files.**
`BE/src/controllers/uploadController.ts` (`previewAttachment`, ~L200–245), `BE/src/middlewares/upload.ts` (image filters accept SVG).

### H-3 — Long-lived access tokens, tokens in `localStorage`, no access-token revocation

**Description.**
Access tokens are JWTs with a **7-day** lifetime (`JWT_EXPIRES_IN=7d`) and are stateless — there is no server-side revocation; `logout` only revokes the refresh-token family. Both access and refresh tokens are persisted in **`localStorage`** on web (`FE/src/lib/secureStorage.ts`, `FE/src/stores/auth.ts`; portal `vh-exec-token`). Any XSS (e.g. H-2) yields a token usable for up to 7 days with no way to invalidate it.

**Impact.**
Large stolen-token blast radius; XSS becomes full, persistent account takeover; logout does not stop a leaked access token.

**Suggested Fix.**
Shorten access-token TTL to ~15 minutes (refresh rotation already exists). Prefer `httpOnly`, `Secure`, `SameSite` cookies for tokens, or at minimum keep the refresh token out of JS-readable storage. Consider a short server-side access-token denylist (jti) for forced logout.

**Affected Files.**
`BE/src/config/env.ts` (`JWT_EXPIRES_IN`), `BE/src/utils/jwt.ts`, `FE/src/stores/auth.ts`, `FE/src/lib/secureStorage.ts`, `portal/src/lib/executive/api.ts`.

### H-4 — Audit trail not written for most V2 domain mutations

**Description.**
A robust audit helper exists (`BE/src/utils/audit.ts`) and is used by the V1 controllers and a few V2 modules (`organizations`, `up3s`, `tickets`, `asset-categories`, `asset-types`, `workflow`). However the **majority of V2 mutations do not record audit entries**: creating/updating/deleting assets, locations, feeders, inspections, HAR reports, documents, generated reports, and import runs all write data with **no `recordAudit` call**.

**Impact.**
No tamper-evident trail of who changed core asset/inspection data — a compliance and incident-investigation gap for a regulated utility, and inconsistent with the system's own stated audit capability.

**Suggested Fix.**
Add transactional `recordAudit(...)` (passing the `tx` client) to every create/update/delete in the V2 services, or centralize via a service-layer decorator/middleware. Extend the `AuditEntityType` union to cover ASSET, LOCATION, FEEDER, INSPECTION, HAR, DOCUMENT, IMPORT.

**Affected Files.**
`BE/src/modules/assets/asset.service.ts`, `locations/location.service.ts`, `feeders/feeder.service.ts`, `inspections/inspection.service.ts`, `har/har.service.ts`, `documents/document.service.ts`, `reports/report.service.ts`, `imports/import.service.ts`; helper `BE/src/utils/audit.ts`.

### H-5 — Synchronous, in-request Excel import processing

**Description.**
`ImportService.runImport` parses the whole workbook into memory and processes **every row synchronously inside the HTTP request**, calling `assetService.create`/`locationService.create` per row — each of which issues several validation/uniqueness queries. A large import (thousands of rows) blocks the Node event loop and will exceed typical proxy/client timeouts, leaving a half-applied import.

**Impact.**
Request timeouts, degraded latency for all concurrent users during an import, and partial/ambiguous import state on timeout.

**Suggested Fix.**
Move imports to a background job (the existing notification-queue pattern, or a proper worker) and return a job id immediately; the UI already polls `GET /v1/imports/:id`. Batch row inserts and cap file size/row count. Stream-parse the workbook rather than buffering.

**Affected Files.**
`BE/src/modules/imports/import.service.ts`, `import.parser.ts`, `import.controller.ts`, `import.routes.ts`.

---

## Medium Priority Issues

### M-1 — Executive Portal has no token refresh and discards the refresh token

**Description.**
`portal/src/lib/executive/api.ts#login` stores only `accessToken` (`setToken(body.data.tokens.accessToken)`) and drops the refresh token. `apiGet` has no 401 handling or refresh logic. When the access token expires, portal calls simply start failing.

**Impact.**
Executive sessions silently break (blank widgets / errors) at access-token expiry; users must guess that re-login is required. With H-3's fix (short access TTL) this becomes a constant failure.

**Suggested Fix.**
Either persist the refresh token and add a refresh-on-401 interceptor (as the main FE client does), or treat any 401 as "session expired" and redirect to the login gate cleanly.

**Affected Files.**
`portal/src/lib/executive/api.ts`, `portal/src/lib/executive/auth.tsx`, `portal/src/lib/executive/queries.ts`.

### M-2 — Upload file filter trusts client MIME; permissive types; no content validation

**Description.**
`upload.ts` filters accept any `image/*`, any `video/*`, and `application/octet-stream` based purely on the client-declared MIME header. There is no magic-byte/content sniffing. The safety net is `safeUploadFilename` (extension allowlist → `.bin`) and the static-serve headers, but the permissive filter still lets disguised content land on disk and feeds H-2.

**Impact.**
Disguised/oversized/unexpected files accepted; contributes to the XSS vector and to storage abuse.

**Suggested Fix.**
Validate real content type with magic bytes (e.g. `file-type`), narrow the allowlist to what each feature needs, and drop blanket `image/*`/`video/*`/`octet-stream` acceptance. Reject SVG explicitly.

**Affected Files.**
`BE/src/middlewares/upload.ts`, `BE/src/utils/uploadSecurity.ts`.

### M-3 — 50 MB JSON/urlencoded body limits enable memory-exhaustion DoS

**Description.**
`express.json({ limit: '50mb' })` and `urlencoded({ limit: '50mb' })` apply to **every** endpoint. A handful of concurrent 50 MB JSON bodies can exhaust memory. The documentation upload also allows 50 files × 50 MB.

**Impact.**
Cheap denial of service; unbounded memory pressure.

**Suggested Fix.**
Drop the JSON limit to a sane value (e.g. 1 MB) and apply larger limits only to the specific upload routes that need them. Enforce aggregate upload-size caps.

**Affected Files.**
`BE/src/index.ts` (L52–53), `BE/src/middlewares/upload.ts`.

### M-4 — Heavy multi-join KPI/GIS aggregates without verified supporting indexes

**Description.**
KPI and GIS use raw aggregate SQL with multiple `LEFT JOIN`s and `GROUP BY` across `locations/assets/feeders/tickets/inspections` (`kpi.repository.ts`, `gis.repository.ts`). These are well-written and parameterized, but their performance depends on composite indexes on the join/filter columns (`locationId`, `deletedAt`, `status`, `latitude/longitude`, `up3`). The audit could not confirm those indexes exist.

**Impact.**
Full-table scans and slow dashboards/maps as data grows; the executive portal and GIS map are the most exposed.

**Suggested Fix.**
Review the Prisma schema/migrations and add composite indexes matching the KPI/GIS predicates; load-test with `BE/load-tests` (k6) at representative volumes; verify with `EXPLAIN`.

**Affected Files.**
`BE/src/modules/kpi/kpi.repository.ts`, `BE/src/modules/gis/gis.repository.ts`, `BE/prisma/schema.prisma`.

### M-5 — Login lockout state is in-process and in-memory

**Description.**
The per-account brute-force lock (`services/loginLockout.ts`) is held in process memory. It resets on restart/redeploy and is **not shared across instances**, so in a horizontally scaled deployment an attacker can spread attempts across replicas to defeat the 5-attempt lock. The IP rate limiter (`express-rate-limit`) is also in-memory per instance.

**Impact.**
Weakened brute-force protection under the very scaling the production-hardening plan anticipates.

**Suggested Fix.**
Back lockout and rate limiting with a shared store (Redis). At minimum, document that the app must run single-instance until this is addressed.

**Affected Files.**
`BE/src/services/loginLockout.ts`, `BE/src/middlewares/rateLimit.ts`.

### M-6 — Two parallel frontend role-guard systems

**Description.**
The FE has both `FE/src/lib/route-guards.ts` (lowercase roles `"admin"`/`"superadmin"`, redirects to `/dashboard`) and `FE/src/lib/v2/route-guards.ts` + `rbac.ts` (uppercase `SUPERADMIN`/`ADMIN`/`PETUGAS`, redirects to `/unauthorized`). Different routes use different systems (e.g. `_app.validasi.tsx` uses the V1 guard; `_app.users.tsx` uses `requireV2Role`).

**Impact.**
Maintenance hazard: the two role vocabularies and redirect behaviors can drift, producing inconsistent gating. (Note: this is UX/defense-in-depth only — the backend is the real enforcer.)

**Suggested Fix.**
Consolidate onto the V2 RBAC module; delete the V1 guard once all routes are migrated.

**Affected Files.**
`FE/src/lib/route-guards.ts`, `FE/src/lib/v2/route-guards.ts`, `FE/src/lib/v2/rbac.ts`, `FE/src/routes/_app.validasi.tsx`.

### M-7 — Notification delivery queue runs in-process in every instance

**Description.**
`NotificationQueue` polls the DB on a timer inside the API process (`index.ts` starts it). Row-level claim guards prevent double-send, but running it in every replica multiplies DB polling and couples worker health to API health.

**Impact.**
Added DB contention when scaled; no isolation of background work from request handling.

**Suggested Fix.**
Run the queue as a dedicated worker process/deployment, or gate it behind a leader-election/`WORKER=true` flag so only one instance polls.

**Affected Files.**
`BE/src/modules/notifications/notification.queue.ts`, `BE/src/index.ts`.

### M-8 — Weak password policy

**Description.**
`changePassword` enforces only `newPassword.length >= 6` with no complexity, reuse, or breach checks. No password policy is applied at user creation either.

**Impact.**
Weak credentials for a system holding operational utility data.

**Suggested Fix.**
Enforce a stronger policy (length ≥ 12, complexity or passphrase, optional HIBP check) consistently at creation and change.

**Affected Files.**
`BE/src/controllers/authController.ts` (`changePassword`), `BE/src/controllers/userController.ts`.

---

## Low Priority Issues

### L-1 — Health check does not verify database connectivity
**Description.** `/health` and `/api/health` return a static `OK` without pinging the DB. **Impact.** A load balancer may keep routing traffic to an instance whose DB connection is dead. **Suggested Fix.** Add a `SELECT 1` (`prisma.$queryRaw`) with a short timeout and return 503 on failure. **Affected Files.** `BE/src/index.ts`, `BE/src/routes/index.ts`.

### L-2 — Swagger UI publicly exposed in all environments
**Description.** `/api/docs` and `/api/docs.json` are mounted with no auth and before the rate limiter, in every environment. **Impact.** Full API surface disclosure in production aids attackers. **Suggested Fix.** Disable docs in production or protect them (basic auth / admin token / IP allowlist). **Affected Files.** `BE/src/index.ts` (L94–97), `BE/src/config/swagger.ts`.

### L-3 — `console.*` logging instead of structured logger
**Description.** Controllers/services log via `console.log`/`console.error`; a `requestLogger` exists but isn't a structured logger. **Impact.** Hard to correlate/ship logs; no levels or request IDs in app logs. **Suggested Fix.** Adopt a structured logger (pino/winston) with request correlation; route through it consistently. **Affected Files.** `BE/src/middlewares/logger.ts`, all `*.controller.ts`/`*Controller.ts`.

### L-4 — `.bak` route files committed as dead code
**Description.** `FE/src/routes/` contains `_app.dashboard.tsx.bak`, `_app.rtupp.tsx.bak`, `_app.users.tsx.bak`. **Impact.** Confusion and stale-guard risk (the `.bak` files still reference `requireRole`). **Suggested Fix.** Remove the `.bak` files from version control. **Affected Files.** `FE/src/routes/*.bak`.

### L-5 — Dev `.env` with placeholder secrets present on disk
**Description.** `BE/.env` ships `NODE_ENV=development` with placeholder JWT secrets and an empty-password DB URL. `validateProductionEnv()` correctly refuses to boot production with these, so risk is low. **Impact.** Risk only if copied to a prod host with `NODE_ENV` forced/secrets unchanged. **Suggested Fix.** Keep `.env` out of deployable artifacts; provision prod secrets via the platform's secret store. **Affected Files.** `BE/.env`, `BE/.gitignore` (already ignores it).

### L-6 — `/uploads` served without cache headers or dedicated rate limiting
**Description.** Static media is served with forced `attachment`/`nosniff` (good) but no `Cache-Control`/`ETag` and outside any media-specific throttling. **Impact.** Higher bandwidth/origin load for repeatedly fetched media. **Suggested Fix.** Add cache headers for immutable uploads; consider serving via CDN/object storage in production. **Affected Files.** `BE/src/index.ts` (static mounts).

---

## Things that are done well (for reviewer context)

- **Auth core:** bcrypt hashing, server-side refresh-token rotation with family revocation and reuse detection, per-account lockout, IP rate limiting, and `validateProductionEnv()` that refuses insecure prod boots.
- **Input validation:** consistent Zod validation middleware with pagination caps (`limit ≤ 100`) on V2 list endpoints.
- **SQL safety:** all raw KPI/GIS queries use parameterized tagged templates / `Prisma.sql` — no string interpolation, no injection.
- **RBAC normalization:** clean canonical 3-role model with legacy folding, fail-closed on unknown roles, mirrored on the frontend.
- **Frontend resilience:** global error boundary + router `errorComponent`, de-duplicated single-flight token refresh, and a genuinely robust offline queue (idempotency keys on the client, exponential backoff, conflict parking, resumable multi-step inspection replay, no silent data drops).
- **Static-file hardening:** forced download disposition + `nosniff` on the general `/uploads` mount; inline avatars restricted to raster types.

> The single most important pre-UAT action is **C-1 (tenant scoping)**. Until the V2 domain enforces RTUPP/UP3 isolation consistent with the KPI layer, the portal and asset APIs expose cross-region data and cross-region write access.
