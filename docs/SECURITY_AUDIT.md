# VoltReport — Security Audit (Sprint D)

Audit of authentication, file upload, API exposure, and database access, with
fixes applied. Severity uses CVSS-style bands (Critical/High/Medium/Low/Info).

## Summary of findings

| # | Area | Finding | Severity | Status |
|---|------|---------|----------|--------|
| V1 | JWT | Hardcoded fallback secrets (`default-secret-change-in-production`) usable in prod → forgeable tokens | **Critical** | ✅ Fixed |
| V2 | Auth | No per-account brute-force lockout | **High** | ✅ Fixed (D2) |
| V3 | API | No rate limiting (login/API abuse, credential stuffing) | **High** | ✅ Fixed |
| V4 | Upload | On-disk filename keeps original extension; MIME is spoofable → executable/script upload | **Medium** | ✅ Fixed |
| V5 | Upload | User files served inline by `express.static` → stored XSS (SVG/HTML), inline render | **Medium** | ✅ Fixed |
| V6 | Refresh | Refresh tokens are stateless & long-lived (30d), no revocation/rotation | **Medium** | ⚠️ Documented |
| V7 | CORS | Single origin + credentials; `*` would be unsafe | **Low** | ✅ Hardened |
| V8 | DB | SQL injection via raw queries | **Info** | ✅ Not present |

---

## Details & fixes

### V1 — Weak JWT secrets (Critical) ✅
**Risk:** If `JWT_SECRET`/`JWT_REFRESH_SECRET` are unset in production, the app
silently used public hardcoded defaults. Anyone could forge a valid admin token.

**Fix:** [`BE/src/config/env.ts`](../BE/src/config/env.ts) → `validateProductionEnv()`
refuses to boot in production when secrets are a known default, shorter than 32
chars, identical to each other, or when `DATABASE_URL` is missing /
`CORS_ORIGIN === '*'`. Invoked at the top of [`BE/src/index.ts`](../BE/src/index.ts).
Dev/test keep working defaults (no behaviour change).

### V2 — Brute-force account lockout (High) ✅
**Fix:** [`BE/src/services/loginLockout.ts`](../BE/src/services/loginLockout.ts) —
**5 failed logins → 15-minute lock** per account, enforced in `login`
([`authController.ts`](../BE/src/controllers/authController.ts)). Locked logins
return **429** with a `Retry-After` header; a successful login clears the
counter. Unknown emails are counted too (no account-enumeration shortcut).
Covered by unit + controller tests.

### V3 — API rate limiting (High) ✅
**Fix:** [`BE/src/middlewares/rateLimit.ts`](../BE/src/middlewares/rateLimit.ts)
with `express-rate-limit`:
- `apiLimiter` — 100 req / 15 min / IP across the whole `/api` surface.
- `authLimiter` — 20 failed auth req / 15 min / IP on `/auth/login` + `/auth/refresh`
  (outer IP layer beneath the per-account lock).
`app.set('trust proxy', 1)` so the real client IP is used behind Nginx.
Skipped under `NODE_ENV=test`.

### V4 — Executable upload via extension (Medium) ✅
**Risk:** `fileFilter` validates the client-supplied MIME type (spoofable), and
the stored filename reused the original extension — a file could land on disk as
`.php`/`.html`/`.svg`.

**Fix:** [`BE/src/utils/uploadSecurity.ts`](../BE/src/utils/uploadSecurity.ts) —
`safeUploadFilename()` forces a **whitelisted extension**
(`jpg/jpeg/png/webp/mp4/mov/avi/pdf/txt/log/xlsx`); anything else becomes `.bin`.
Applied in [`upload.ts`](../BE/src/middlewares/upload.ts) and
[`uploadMiddleware.ts`](../BE/src/middlewares/uploadMiddleware.ts). Existing size
& count limits retained.

### V5 — Inline serving of user content (Medium) ✅
**Fix:** [`BE/src/index.ts`](../BE/src/index.ts) static `/uploads` now sends
`Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`, so an
uploaded file is always downloaded, never rendered/executed inline (mitigates
stored XSS via SVG/HTML). `helmet()` remains enabled globally.

### V6 — Refresh token lifecycle (Medium) ⚠️ Documented
Refresh tokens are stateless JWTs valid 30 days with no server-side revocation
or rotation. A leaked refresh token is usable until expiry.
**Recommendation (future, needs schema/migration):** persist refresh tokens
(or a jti denylist) so logout/password-change can revoke them, and rotate on
use. Not changed now to preserve the current stateless flow (no DB migration in
this hardening pass). Mitigations in place: short access-token TTL + IP/auth
rate limiting + account lockout.

### V7 — CORS (Low) ✅
`cors({ origin: env.CORS_ORIGIN, credentials: true })` — single trusted origin.
`validateProductionEnv()` now rejects `CORS_ORIGIN === '*'` (a wildcard with
credentials is invalid/unsafe). Set `CORS_ORIGIN` to the real frontend URL per
environment.

### V8 — SQL injection / Prisma misuse (Info) ✅ Not present
No `$queryRawUnsafe` / `$executeRawUnsafe` / string-built SQL anywhere in `src`.
All DB access goes through the Prisma client with parameterised queries. Query
inputs are validated with Zod (e.g. rekap query schema). No action needed; keep
avoiding `*Unsafe` raw APIs.

---

## Residual recommendations (out of this sprint's scope)
- Implement refresh-token revocation/rotation (V6). → **Done since** (see Pass 2 §"Already solid"): `services/refreshTokenService.ts` now persists hashed tokens with rotation + family-based theft detection.
- Add a virus/AV scan step for uploaded documents in high-risk deployments.
- Periodic `npm audit` in CI (wired in Sprint F1) and dependency updates.
- Consider Redis-backed lockout/rate-limit for multi-instance deployments.

---
---

# VoltHub — Security Audit Pass 2 (2026-06-06)

**Scope:** Full re-audit of Backend (`BE/` — Express + Prisma) and Frontend
(`FE/` — React + TanStack + Zustand) covering authentication, authorization,
file upload, API (injection / XSS / validation), and frontend token handling.
Fixes are additive and preserve existing API contracts (no breaking changes).

## Executive summary

Since Sprint D the platform matured substantially — refresh-token rotation
(closing prior **V6**), per-account lockout, IP rate limiting, parameterized
raw SQL, upload extension allow-listing, and a production config guard are all
in place. This pass found **no critical (exploitable-now) vulnerabilities** and
applied focused hardening for a long-lived access token, an unpinned JWT
algorithm, and sessions surviving a password change.

| Severity | Found | Fixed | Residual |
|----------|-------|-------|----------|
| Critical | 0 | 0 | 0 |
| High     | 2 | 2 | 0 |
| Medium   | 2 | 2 | 1 |
| Low      | 1 | 0 | 4 |

## Already solid (verified, no change)

- **Refresh tokens** (`services/refreshTokenService.ts`): SHA-256-hashed at rest, rotated on every use, reuse of a rotated token revokes the whole session family (theft detection); single/all-device revocation supported. *(Resolves Sprint D V6.)*
- **Login brute force**: per-account lockout (5→15 min) + IP `authLimiter` (20/15 min) + broad `apiLimiter`; unknown emails counted (no enumeration).
- **RBAC** (`middlewares/rbac.ts`, `auth/roles.ts`): canonical 3-role model; `authenticate` on every V1 route file and all 22 V2 module routers; `requireOwnershipOrAdmin` for PETUGAS ownership.
- **SQL injection**: all raw SQL (`modules/kpi`, `modules/gis`) uses Prisma tagged templates / `Prisma.sql` / `Prisma.join`; no `*Unsafe` APIs. Verified `siteWhere` binds every value.
- **Upload safety**: forced whitelisted on-disk extension (unknown → `.bin`), avatars raster-only (no SVG), `/uploads` served `attachment` + `nosniff`.
- **Frontend token handling**: `secureStorage` (Capacitor secure store on native, localStorage on web); 401s de-duplicated through one in-flight `/auth/refresh`; rotated tokens persisted; refresh failure → logout + redirect.

## Findings & fixes applied

### P2-1 (High) — Access token valid for 7 days
Access tokens aren't server-tracked, so they can't be revoked; a 7-day TTL meant a leaked token survived logout/`logout-all`.
**Fix:** default `JWT_EXPIRES_IN` **7d → 1h** (`config/env.ts`). FE auto-rotates on 401, so it's invisible to users. Still env-overridable.

### P2-2 (High) — JWT verification algorithm not pinned
`jwt.verify` accepted any header-declared `alg` (algorithm-confusion / `none` footgun).
**Fix:** sign + verify locked to `HS256` (`utils/jwt.ts`): `{ algorithms: ['HS256'] }`. Tokens declaring any other algorithm are rejected.

### P2-3 (Medium) — Sessions survived a password change
After `change-password`, all prior refresh-token families stayed valid — a password change did not evict a token-holding attacker.
**Fix:** `changePassword` now `revokeAllForUser` + opens one fresh session for the current device and returns the new pair (`controllers/authController.ts`); FE adopts the returned tokens (`lib/api/auth.ts`). Additive — old clients re-login on next refresh.

### P2-4 (Medium) — Password length uncapped (bcrypt 72-byte truncation)
bcrypt ignores bytes past 72 → false strength + wasted CPU.
**Fix:** `.max(72)` on create/reset schemas (`controllers/userController.ts`) and explicit check in `changePassword`. Min length (6) preserved.

### P2-5 (Low) — Permissive upload fallback branch
`uploadMiddleware.ts` fallback `fileFilter` accepts any MIME when no category matches. **Mitigated** by forced extension allow-list + attachment/nosniff serve. Left as-is to avoid breaking document uploads (residual R-3).

## Remaining risks (accepted / recommended)

- **R-1 (Medium) — No magic-byte content validation.** MIME is client-controlled; only extension is enforced. Mitigated by attachment+nosniff serve. *Add `file-type` sniffing for true verification.*
- **R-2 (Low) — `express.json({ limit: '50mb' })`** is generous (kept for offline-sync/import). *Lower to ~2–5 MB except on import routes.*
- **R-3 (Low) — Permissive upload fallback** (P2-5). *Tighten default branch to an explicit allow-list.*
- **R-4 (Low) — Web tokens in localStorage**, reachable by XSS. Mitigated by 1h access TTL, Helmet, React escaping, and no untrusted-HTML sinks (only `dangerouslySetInnerHTML` is the shadcn chart-style block on developer-controlled config). *Migrate to httpOnly+SameSite cookies if a shared origin/proxy is available.*
- **R-5 (Low) — Password min 6, no complexity.** Kept for compatibility. *Raise to 8+ with zxcvbn/HIBP on next forced reset.*

## Files changed (Pass 2)

| File | Change |
|------|--------|
| `BE/src/utils/jwt.ts` | Pin sign/verify to `HS256` (P2-2) |
| `BE/src/config/env.ts` | Default access-token TTL 7d → 1h (P2-1) |
| `BE/src/controllers/authController.ts` | Revoke all sessions + reissue on password change; cap newPassword at 72 (P2-3, P2-4) |
| `BE/src/controllers/userController.ts` | `.max(72)` on create/reset password schemas (P2-4) |
| `FE/src/lib/api/auth.ts` | Adopt rotated tokens returned by change-password (P2-3) |

**Verification:** `tsc --noEmit` clean; `jwt.test.ts` + `refreshTokenService.test.ts` + `authController.test.ts` → **29/29 passing**.
