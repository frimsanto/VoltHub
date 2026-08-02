-- ============================================================================
-- VoltReport — GOLDEN BASELINE  ·  STEP 01: CLEANUP
-- Purpose : Remove ALL dummy/test data from every transactional + master table,
--           leaving a clean state. PRESERVES Prisma migration history.
-- Target  : MySQL/MariaDB database `voltreport` (schema = BE/prisma/schema.prisma).
-- Safety  : Single transaction; FK checks disabled ONLY for the wipe (handles the
--           users<->teams circular FK: teams.leaderId -> users.id, users.teamId
--           -> teams.id). _prisma_migrations is intentionally NEVER touched.
-- Scope   : The Speedometer module has been removed — there is no longer a
--           `laporan_speedometer` table. System keeps only Laporan Awal + Akhir.
-- Verified: 10 transactional/master tables; _prisma_migrations has 7 applied
--           rows (must remain 7 after this).
-- ============================================================================

USE voltreport;

START TRANSACTION;
SET FOREIGN_KEY_CHECKS = 0;

-- Leaf / dependent tables first (defensive ordering; FK checks are off anyway).
DELETE FROM activity_logs;        -- audit records
DELETE FROM report_validations;   -- validation records
DELETE FROM attachments;          -- uploaded file rows (ON DELETE CASCADE from reports)
DELETE FROM laporan_akhir;        -- report records
DELETE FROM laporan_awal;

-- Identity / org / master tables (users<->teams circular FK).
DELETE FROM users;
DELETE FROM teams;
DELETE FROM personil;
DELETE FROM rtupps;

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;

-- _prisma_migrations is preserved (NOT in any DELETE above).

-- Post-cleanup sanity (every transactional/master count must be 0; migrations = 7):
-- SELECT
--   (SELECT COUNT(*) FROM users)              AS users,
--   (SELECT COUNT(*) FROM rtupps)             AS rtupps,
--   (SELECT COUNT(*) FROM teams)              AS teams,
--   (SELECT COUNT(*) FROM personil)           AS personil,
--   (SELECT COUNT(*) FROM laporan_awal)       AS laporan_awal,
--   (SELECT COUNT(*) FROM laporan_akhir)      AS laporan_akhir,
--   (SELECT COUNT(*) FROM attachments)        AS attachments,
--   (SELECT COUNT(*) FROM report_validations) AS report_validations,
--   (SELECT COUNT(*) FROM activity_logs)      AS activity_logs,
--   (SELECT COUNT(*) FROM _prisma_migrations) AS migrations_preserved;
