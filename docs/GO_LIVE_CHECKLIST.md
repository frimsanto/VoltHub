# VoltReport — Go-Live Checklist

> Master checklist to take VoltReport into production as an internal PLN
> operational system. Status legend: ✅ done · 🟡 in progress / config needed ·
> ❌ blocker · ⬜ not started. Cross-references: [`STAGING_DEPLOYMENT.md`](./STAGING_DEPLOYMENT.md),
> [`ANDROID_RELEASE.md`](./ANDROID_RELEASE.md), [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md),
> [`UAT_CHECKLIST.md`](./UAT_CHECKLIST.md), [`BACKUP.md`](./BACKUP.md),
> [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md), [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md).

**Target go-live date:** ____________  **Release tag:** ____________  **Sign-off:** ____________

---

## 1. Infrastruktur

| # | Item | Status | Catatan / Owner |
|---|---|---|---|
| 1.1 | **Domain** produksi (`voltreport.pln.co.id`) + DNS A/AAAA | 🟡 | DevOps — arahkan ke Nginx |
| 1.2 | **SSL/TLS** sertifikat valid (Let's Encrypt / PLN CA), auto-renew | 🟡 | Nginx TLS termination, redirect 80→443 |
| 1.3 | **Reverse proxy** Nginx (gzip, proxy `/api`, cache `/uploads`, SPA fallback) | ⬜ | belum ada config tercommit (rekomendasi G1) |
| 1.4 | **App server** Node 20 + pm2/systemd auto-restart + log rotation | 🟡 | unit belum tercommit |
| 1.5 | **Database** MySQL 8 host terpisah, least-privilege user | 🟡 | DBA |
| 1.6 | **Uploads volume** persisten & ter-backup, terpisah dari deploy dir | 🟡 | mount `UPLOAD_DIR` |
| 1.7 | **Backup** cron nightly (`backup.sh --with-uploads`) + off-site sync | 🟡 | off-site sync belum otomatis |
| 1.8 | **Monitoring** Sentry aktif (env=production, DSN terpisah) | ✅ | terintegrasi BE+FE |
| 1.9 | **Uptime check** eksternal hit `/health` + alerting | ⬜ | rekomendasi |
| 1.10 | **Env separation** dev/staging/prod terpisah penuh | ✅ | [`ENVIRONMENTS.md`](./ENVIRONMENTS.md) |
| 1.11 | **Boot guard** `validateProductionEnv()` lulus di host prod | ✅ | menolak secret lemah/CORS `*` |

## 2. Security

| # | Item | Status | Catatan |
|---|---|---|---|
| 2.1 | **JWT** secrets kuat & berbeda (≥32 char), access 1d / refresh 30d | ✅ | di-enforce saat boot |
| 2.2 | **Refresh token revocation + rotation** (whitelist, reuse-detection) | ✅ | **Phase G4** — store `refresh_tokens`, logout single/all device |
| 2.3 | **Secrets** via secret manager (bukan `.env` di repo) | 🟡 | pindahkan dari file ke Vault/secret store |
| 2.4 | **Upload security** MIME/ekstensi/ukuran, served `attachment`+`nosniff` | ✅ | [`uploadSecurity.ts`](../BE/src/utils/uploadSecurity.ts) |
| 2.5 | **Rate limit** global + auth-specific | ✅ | + login lockout 5×/15m |
| 2.6 | **CORS** allow-list origin produksi (bukan `*`) | ✅ | di-enforce |
| 2.7 | **Helmet** security headers | ✅ | aktif |
| 2.8 | **RBAC** 4 peran (swap ADMIN↔ADMIN_RTUPP applied) teruji | ✅ | rbac tests hijau |
| 2.9 | **Password** bcrypt, `mustChangePassword` first-login | ✅ | |
| 2.10 | **Security audit** ditinjau | ✅ | [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md) |
| 2.11 | **FCM legacy key** → rencana migrasi HTTP v1 | 🟡 | utang teknis, non-blocker |

## 3. Mobile

| # | Item | Status | Catatan |
|---|---|---|---|
| 3.1 | **Android release build** (AAB signed) | ⬜ | folder `android/` belum di-generate (G2) |
| 3.2 | **Keystore** dibuat + backup off-site + secret manager | ⬜ | [`ANDROID_RELEASE.md`](./ANDROID_RELEASE.md) §3 |
| 3.3 | **`allowMixedContent` → false**, API HTTPS | ⬜ | wajib sebelum Play |
| 3.4 | **Icon & splash** logo PLN resmi | 🟡 | placeholder saat ini |
| 3.5 | **Versioning** sinkron `appVersion.ts`/`build.gradle`/BE | ✅ | proses terdokumentasi |
| 3.6 | **Firebase** project + `google-services.json` + SHA1/SHA256 | ⬜ | [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md) |
| 3.7 | **Push notification** channel + foreground + deep-link tap | ✅ | **Phase G3** — `push.ts` ditingkatkan |
| 3.8 | **Force-update gate** (HTTP 426) | ✅ | BE+FE |
| 3.9 | **Offline-first** queue + foto IndexedDB | ✅ | Fase 1&2 |
| 3.10 | **GPS & kamera native** | ✅ | dengan fallback web |
| 3.11 | **Play Console** internal testing → UAT → production | ⬜ | atau distribusi MDM internal |

## 4. Operasional (SOP)

| # | Item | Status | Catatan |
|---|---|---|---|
| 4.1 | **SOP Incident** (deteksi → triage → eskalasi → post-mortem) | 🟡 | lihat template §6 |
| 4.2 | **SOP Backup** (jadwal, verifikasi, retensi, off-site) | ✅ | [`BACKUP.md`](./BACKUP.md) |
| 4.3 | **SOP Restore** (uji restore bulanan di staging) | ✅ | [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md) |
| 4.4 | **Contact Person / on-call** matrix terisi | 🟡 | §5 |
| 4.5 | **Runbook deploy & rollback** | ✅ | [`STAGING_DEPLOYMENT.md`](./STAGING_DEPLOYMENT.md) §8–9 |
| 4.6 | **UAT** dijalankan & ditandatangani PLN | ⬜ | [`UAT_CHECKLIST.md`](./UAT_CHECKLIST.md) |
| 4.7 | **Pelatihan user** (petugas/admin) + materi singkat | ⬜ | |

## 5. Rollback

| # | Item | Status | Catatan |
|---|---|---|---|
| 5.1 | **Aplikasi** rollback ke tag sebelumnya (BE+FE) teruji | ✅ | [`STAGING_DEPLOYMENT.md`](./STAGING_DEPLOYMENT.md) §9.1 |
| 5.2 | **Database** restore dari backup pra-deploy | ✅ | §9.2 + DR runbook |
| 5.3 | **Deployment** strategi promote artifact yang sama staging→prod | ✅ | |
| 5.4 | **Mobile** tahan rilis Play di internal track jika cacat | ✅ | bertahap |
| 5.5 | **Backup pra-deploy** disimpan ≥24 jam | ✅ | aturan runbook |

---

## 6. Contact Person / On-call (isi sebelum go-live)

| Peran | Nama | Kontak | Jam |
|---|---|---|---|
| Product Owner (PLN) | | | |
| Tech Lead / Backend | | | |
| DevOps / Infra | | | |
| DBA | | | |
| Mobile | | | |
| On-call utama | | | 24/7 |
| Eskalasi | | | |

## 7. SOP Incident (ringkas)

1. **Deteksi** — alert Sentry / uptime / laporan user.
2. **Triage** — tentukan severity (Critical: layanan down/ data loss; High: fitur inti rusak; Medium/Low).
3. **Mitigasi** — Critical → rollback aplikasi (§5.1) atau restore DB (§5.2); umumkan ke contact person.
4. **Komunikasi** — informasikan status ke PLN ops setiap 30 menit untuk Critical.
5. **Resolusi & verifikasi** — smoke test ([`STAGING_DEPLOYMENT.md`](./STAGING_DEPLOYMENT.md) §10).
6. **Post-mortem** — root cause + tindakan pencegahan dalam 48 jam.

---

## 8. Status Go-Live

**Blocker yang masih ada (harus diselesaikan sebelum produksi):**
1. ❌ **Android `android/` project belum di-generate / signed** (G2) — wajib untuk rilis mobile.
2. ❌ **Firebase produksi belum dikonfigurasi** (`google-services.json`, SHA) (G3) — push mobile mati tanpanya.
3. ❌ **UAT belum dijalankan & ditandatangani** PLN.
4. 🟡 **Infra config belum tercommit**: Nginx, pm2/systemd unit, off-site backup sync, uptime check.
5. 🟡 **Secrets** masih berbasis file `.env` — pindahkan ke secret manager.

> Catatan: jika peluncuran **tahap pertama hanya Web/PWA** (tanpa Android native),
> blocker #1–#2 menjadi **non-blocking** dan dapat menyusul di rilis mobile berikutnya.

**Estimasi kesiapan go-live:**

| Jalur rilis | Kesiapan | Sisa pekerjaan |
|---|---|---|
| **Web / PWA only** | **~90%** | Infra config (Nginx/pm2/uptime), secret manager, UAT sign-off |
| **Full (Web + Android)** | **~75%** | + generate/sign Android, Firebase prod, Play internal testing, UAT mobile |

**Rekomendasi:** Go-live **bertahap** — luncurkan **Web/PWA** lebih dulu (backend & web sudah production-grade: test 117 hijau, security keras, observable, recoverable), sambil menyelesaikan jalur Android + Firebase untuk rilis mobile susulan.

**Keputusan go-live:** ☐ GO (Web/PWA)  ☐ GO (Full)  ☐ TUNDA
Disetujui: ______________________  Tanggal: ____________
