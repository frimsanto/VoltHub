# VoltReport — Disaster Recovery (DR) Runbook

Operational playbook for recovering VoltReport from major failures. Pair with
[`BACKUP.md`](./BACKUP.md).

## Objectives
| Metric | Target |
|--------|--------|
| **RPO** (max data loss) | ≤ 24h (daily backup) — reduce by running backups more often |
| **RTO** (max downtime) | ≤ 2h for full rebuild |

## Architecture at a glance
- **Backend**: Node/Express (`BE/`), serves API at `/api`, writes uploads to `BE/uploads/`.
- **Database**: MySQL (`voltreport`).
- **Frontend**: static SPA built from `FE/` (`dist/`), served by Nginx/CDN.
- **Monitoring**: Sentry (BE + FE) — first place to look when something breaks.

## Emergency contacts / escalation
| Role | Responsibility |
|------|----------------|
| On-call engineer | First responder, executes this runbook |
| DBA | Database restore / corruption analysis |
| Admin RTUPP → Admin → Superadmin | Business escalation, user comms |
| Help Desk PLN (`helpdesk@pln.co.id`) | End-user communications |

> Keep this list current with real names/phones in the internal ops wiki (not in git).

---

## Pre-flight (information to gather first)
1. Check Sentry for the triggering error + timeline.
2. Identify the failure class below.
3. Note the **last good backup** time: `BE/scripts/restore.sh --list`.
4. Announce maintenance window to users if downtime is expected.

---

## Scenario 1 — Server down (host/VM lost or unresponsive)
**Symptoms:** API unreachable, health check `GET /health` fails, FE shows
"Server tidak dapat dihubungi".

**Recovery:**
1. **Triage** — is it the process or the host?
   ```bash
   curl -fsS http://<host>:3001/health || echo "API DOWN"
   systemctl status voltreport      # or: pm2 status
   ```
2. **Process crashed** → restart and inspect:
   ```bash
   systemctl restart voltreport     # or: pm2 restart voltreport
   journalctl -u voltreport -n 200 --no-pager
   ```
3. **Host lost** → provision a replacement and rebuild:
   ```bash
   git clone <repo> /opt/voltreport && cd /opt/voltreport
   # Backend
   cd BE && npm ci && npm run build
   cp /secure/backup/.env BE/.env          # restore secrets (NOT in git)
   npx prisma migrate deploy
   # restore latest DB if this host also lost the DB (see Scenario 2)
   # Frontend
   cd ../FE && npm ci && npm run build      # serve dist/ via Nginx
   # Start
   cd ../BE && pm2 start dist/index.js --name voltreport
   ```
4. **Restore uploads** if the host held them (see Scenario 3).
5. **Verify:** `/health` OK → login → create a test report → check Sentry quiet.

---

## Scenario 2 — Database corrupt / lost
**Symptoms:** Prisma errors (`P1001`, `P2021`, `P2010`), 500s on data routes,
inconsistent reads, MySQL won't start.

**Recovery:**
1. **Stop the backend** to prevent further writes:
   ```bash
   systemctl stop voltreport      # or: pm2 stop voltreport
   ```
2. **Assess** — is the DB recoverable or must it be restored?
   ```bash
   mysqlcheck -u root -p --all-databases   # check/repair attempt
   ```
3. **Restore from backup** (overwrites the DB; a safety snapshot is auto-taken):
   ```bash
   BE/scripts/restore.sh --list
   BE/scripts/restore.sh --latest
   #   or a specific tier, e.g. last clean monthly:
   # BE/scripts/restore.sh /mnt/backups/monthly/voltreport-YYYYMMDD-HHMMSS.sql.gz
   ```
4. **Re-apply migrations** in case the backup predates schema changes:
   ```bash
   cd BE && npx prisma migrate deploy
   ```
5. **Restart + verify:**
   ```bash
   systemctl start voltreport
   mysql -e "SELECT COUNT(*) FROM voltreport.User; SELECT COUNT(*) FROM voltreport.LaporanAwal;"
   ```
6. **Communicate RPO** — data created after the restored backup's timestamp is
   lost; ask affected petugas to re-submit recent reports.

---

## Scenario 3 — Loss of uploaded files (`BE/uploads/`)
**Symptoms:** Report attachments / documentation 404, broken image thumbnails,
`/uploads/...` returns Not Found.

**Recovery:**
1. **Restore from the uploads archive** (created by `backup.sh --with-uploads`):
   ```bash
   ls $BACKUP_ROOT/daily/uploads-*.tar.gz
   tar -xzf $BACKUP_ROOT/daily/uploads-YYYYMMDD-HHMMSS.tar.gz -C BE/
   ```
2. **Reconcile DB vs disk** — find attachment rows whose files are missing:
   ```sql
   -- list attachments; cross-check each filePath against disk
   SELECT id, fileName, filePath FROM voltreport.Attachment;
   ```
   For files that cannot be recovered, notify the owning petugas to re-upload
   documentation for the affected reports.
3. **Prevent recurrence:** ensure `uploads/` is on a backed-up/replicated volume
   and that `--with-uploads` runs in the scheduled backup.

> Note: offline-queued photos on mobile clients (Capacitor) may still hold a
> local copy — petugas can re-sync before clearing their device.

---

## Scenario 4 — Bad release / rollback
**Symptoms:** New deploy introduces a regression — spike in Sentry errors,
failing logins, broken pages immediately after a release.

**Recovery:**
1. **Identify the last good release** (git tag / Sentry release marker):
   ```bash
   git log --oneline -n 10
   git tag --list 'v*' | tail
   ```
2. **Roll back code:**
   ```bash
   git checkout <last-good-tag>
   cd BE && npm ci && npm run build && systemctl restart voltreport
   cd ../FE && npm ci && npm run build      # redeploy dist/
   ```
3. **Database migrations** — only roll back the schema if the bad release applied
   a migration AND a restore is safe (a forward-fix is usually preferable):
   ```bash
   # Prefer a forward fix. If a true rollback is required, restore the
   # pre-deploy DB snapshot and re-deploy the previous schema:
   BE/scripts/restore.sh /mnt/backups/pre-restore/<pre-deploy-snapshot>.sql.gz
   ```
   > Always take a DB backup immediately **before** every production deploy so a
   > clean rollback point exists (add to the deploy pipeline).
4. **Force-update guard:** if a broken native/mobile build shipped, bump
   `APP_MIN_VERSION` (see `BE/src/config/env.ts`) to lock out the bad client.
5. **Verify** core flows (login → create laporan → validasi → export) and
   confirm the Sentry error rate returns to baseline.

---

## Post-incident
- Write a short post-mortem: timeline, root cause, RPO/RTO actually achieved,
  action items.
- Verify backups still run and add/adjust monitoring for the failure mode hit.
- Run a **DR drill quarterly**: restore the latest backup into a scratch DB and
  time the full rebuild against the RTO target.
