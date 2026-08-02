-- ============================================================================
-- VoltReport — GOLDEN BASELINE  ·  STEP 03: VERIFY
-- Run AFTER 01_cleanup.sql + 02_baseline_seed.sql, against database `voltreport`.
-- Read-only. Every "EXPECT" comment states the required value. Any row returned
-- by a "VIOLATION" query is a FAILURE — a clean baseline returns 0 such rows.
--
-- Module scope : Speedometer module REMOVED (no laporan_speedometer table).
-- ============================================================================

USE voltreport;

-- ---------------------------------------------------------------------------
-- A) ROW COUNTS  (master data present, ALL transactional tables empty)
-- ---------------------------------------------------------------------------
SELECT 'users'              AS table_name, COUNT(*) AS rows_found, 5  AS expected FROM users
UNION ALL SELECT 'rtupps',             COUNT(*), 1  FROM rtupps
UNION ALL SELECT 'teams',              COUNT(*), 1  FROM teams
UNION ALL SELECT 'personil',           COUNT(*), 10 FROM personil
UNION ALL SELECT 'laporan_awal',       COUNT(*), 0  FROM laporan_awal
UNION ALL SELECT 'laporan_akhir',      COUNT(*), 0  FROM laporan_akhir
UNION ALL SELECT 'attachments',        COUNT(*), 0  FROM attachments
UNION ALL SELECT 'report_validations', COUNT(*), 0  FROM report_validations
UNION ALL SELECT 'activity_logs',      COUNT(*), 0  FROM activity_logs
UNION ALL SELECT '_prisma_migrations', COUNT(*), 7  FROM _prisma_migrations;

-- ---------------------------------------------------------------------------
-- B) USER ROLE MAPPING  (EXPECT exactly: SUPERADMIN 1, ADMIN 1, PETUGAS 3)
-- ---------------------------------------------------------------------------
SELECT role, COUNT(*) AS cnt FROM users GROUP BY role ORDER BY role;

-- ---------------------------------------------------------------------------
-- C) FK / INTEGRITY VIOLATIONS  (each query MUST return 0 rows)
-- ---------------------------------------------------------------------------

-- C1. Every PETUGAS must belong to TEAM-A and to the RTUPP.
SELECT 'PETUGAS not mapped to team/rtupp' AS violation, u.id, u.email
FROM users u
WHERE u.role = 'PETUGAS'
  AND (u.teamId IS NULL OR u.rtuppId IS NULL
       OR u.teamId  NOT IN (SELECT id FROM teams)
       OR u.rtuppId NOT IN (SELECT id FROM rtupps));

-- C2. Orphan user FKs (rtuppId / teamId pointing nowhere).
SELECT 'orphan user.rtuppId' AS violation, u.id, u.email
FROM users u WHERE u.rtuppId IS NOT NULL AND u.rtuppId NOT IN (SELECT id FROM rtupps);
SELECT 'orphan user.teamId' AS violation, u.id, u.email
FROM users u WHERE u.teamId IS NOT NULL AND u.teamId NOT IN (SELECT id FROM teams);

-- C3. Team leader must exist, and must be a member of that team (same teamId).
SELECT 'team leader invalid or not a member' AS violation, t.id, t.code, t.leaderId
FROM teams t
WHERE t.leaderId IS NULL
   OR t.leaderId NOT IN (SELECT id FROM users)
   OR t.leaderId NOT IN (SELECT id FROM users WHERE teamId = t.id);

-- C4. Team RTUPP mapping must be valid.
SELECT 'orphan team.rtuppId' AS violation, t.id, t.code
FROM teams t WHERE t.rtuppId NOT IN (SELECT id FROM rtupps);

-- C5. Every personil must map to a valid RTUPP.
SELECT 'orphan personil.rtuppId' AS violation, p.id, p.nip
FROM personil p WHERE p.rtuppId NOT IN (SELECT id FROM rtupps);

-- C6. Defensive: no orphan report->creator links (tables should be empty anyway).
SELECT 'orphan laporan_awal.createdById' AS violation, la.id
FROM laporan_awal la WHERE la.createdById NOT IN (SELECT id FROM users);
SELECT 'orphan laporan_akhir.createdById' AS violation, lk.id
FROM laporan_akhir lk WHERE lk.createdById NOT IN (SELECT id FROM users);

-- ---------------------------------------------------------------------------
-- D) FORCE-CHANGE-PASSWORD GATING  (EXPECT: only SUPERADMIN has =0)
-- ---------------------------------------------------------------------------
SELECT email, role, mustChangePassword FROM users ORDER BY FIELD(role,'SUPERADMIN','ADMIN','PETUGAS'), email;
-- EXPECT mustChangePassword=0 for superadmin@voltreport.com ONLY; all others =1.

-- ---------------------------------------------------------------------------
-- E) FINAL ASSERTION  (single PASS/FAIL row)
-- ---------------------------------------------------------------------------
SELECT CASE WHEN
      (SELECT COUNT(*) FROM users)              = 5
  AND (SELECT COUNT(*) FROM rtupps)             = 1
  AND (SELECT COUNT(*) FROM teams)              = 1
  AND (SELECT COUNT(*) FROM personil)           = 10
  AND (SELECT COUNT(*) FROM laporan_awal)       = 0
  AND (SELECT COUNT(*) FROM laporan_akhir)      = 0
  AND (SELECT COUNT(*) FROM attachments)        = 0
  AND (SELECT COUNT(*) FROM report_validations) = 0
  AND (SELECT COUNT(*) FROM activity_logs)      = 0
  AND (SELECT COUNT(*) FROM teams WHERE leaderId IS NOT NULL) = 1
  AND (SELECT COUNT(*) FROM users WHERE role='SUPERADMIN') = 1
  AND (SELECT COUNT(*) FROM users WHERE role='ADMIN')      = 1
  AND (SELECT COUNT(*) FROM users WHERE role='PETUGAS')    = 3
THEN 'BASELINE OK ✅' ELSE 'BASELINE FAILED ❌' END AS baseline_status;
