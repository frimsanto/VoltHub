# Known Issues & Security Debt

## 1. Scoped Access Risk in Legacy Work Order Attachments
- **Symptom:** Legacy Work Order (WO) photos are currently served from the public `/uploads` directory using a simple file server (`express.static`) without any tenant (RTUPP) authentication or authorization checks.
- **Security Vulnerability:** Any authenticated user (or unauthenticated user depending on network access) who knows or guesses the filename can access these photos, resulting in potential cross-RTUPP data leakage.
- **Impact:** Moderate. While filenames contain random UUIDs making them hard to guess, they are not strictly tenant-isolated at the HTTP level.
- **Status:** Documented as Security Debt. Legacy WO attachment retrieval logic was intentionally left untouched in FASE C to preserve backward compatibility. It should be refactored in a future sprint to use a scoped download endpoint similar to the newly introduced `GET /api/v1/laporan-gi/attachments/:attId/download` route.

## 2. Nginx Production Configuration requirement for Large Uploads
- **Requirement:** FASE C introduces support for video attachments up to 150MB.
- **Configuration:** The default client max body size in Nginx is 1M. For the production environment to accept larger attachments (videos, documents), Nginx must be configured with:
  ```nginx
  client_max_body_size 150M;
  ```
- **Location:** In the `server` block or `http` block of `/etc/nginx/nginx.conf` or the site configuration file.
