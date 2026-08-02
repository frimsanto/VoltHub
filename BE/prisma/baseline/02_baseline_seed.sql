-- ============================================================================
-- VoltReport — GOLDEN BASELINE  ·  STEP 02: BASELINE SEED
-- Aligned with CURRENT Prisma schema (BE/prisma/schema.prisma) and CURRENT
-- backend behaviour (auth login, RBAC, dashboard scoping, force-change-password
-- gating in FE/src/routes/_app.tsx).
--
-- Module scope : Speedometer module REMOVED. System keeps Laporan Awal + Akhir.
--
-- Seeds : 1 RTUPP (JAKSEL), 1 Team (TEAM-A), 10 Personil, 5 Users.
-- Users : 1 Super Admin, 1 Admin, 3 Petugas.
-- Empty : laporan_awal, laporan_akhir, attachments, report_validations,
--         activity_logs  (zero transactional data).
--
-- Password : ALL accounts share  ->  VoltReport#2026
--   bcrypt cost-10 hash below was VERIFIED with bcryptjs (the lib the backend
--   uses: bcrypt.compare in authController.ts). Policy: min 6 chars — OK.
-- First login : every account EXCEPT SUPERADMIN has mustChangePassword=1, so
--   FE/_app.tsx redirects them to /change-password before any app access.
--   SUPERADMIN is the break-glass bootstrap account (mustChangePassword=0).
--
-- Run AFTER 01_cleanup.sql, against database `voltreport`. Re-runnable: uses
-- fixed UUIDs so a re-import (after re-running 01) reproduces identical FKs.
-- ============================================================================

USE voltreport;

-- Align the session collation with the table columns (utf8mb4_unicode_ci) so
-- comparisons between user-defined @variables and VARCHAR id columns (e.g. the
-- team-leader UPDATE below) don't raise "Illegal mix of collations".
SET collation_connection = 'utf8mb4_unicode_ci';

START TRANSACTION;

-- --- Shared values --------------------------------------------------------
SET @pwd      = '$2a$10$zV7u3VJcftJgsZEXmohk7O8nr7wMuEHN0bw868XqFdnHJ2CxaTNjC'; -- bcrypt('VoltReport#2026')
SET @now      = NOW();

-- Stable UUIDs (pre-generated so FK wiring is deterministic & re-runnable).
SET @rtupp_id = '2aec9f04-dae7-48ac-a848-5593dfd41b31';
SET @team_id  = 'cccdbe6b-e495-4be2-8cca-59ef086c4002';
SET @u_super  = '40db0351-8d53-474c-84b0-75437bc239f1';
SET @u_admin  = '866025a1-083a-4ae4-966d-93da843e670e';
SET @u_pet1   = 'efc4d42d-051b-4b5b-9f5a-cc88ba9d1bc0';
SET @u_pet2   = 'b186ab60-c599-469f-bd92-aa98939e5128';
SET @u_pet3   = 'd3f1a7c2-6b48-4e90-9a21-7c5e2f0a8b34';

-- --- 1) RTUPP --------------------------------------------------------------
INSERT INTO rtupps (id, code, name, region, address, phone, isActive, createdAt, updatedAt)
VALUES (@rtupp_id, 'JAKSEL', 'UP3 Jakarta Selatan', 'DKI Jakarta',
        'Jl. Radio Dalam Raya No. 12, Jakarta Selatan', '021-1234567', 1, @now, @now);

-- --- 2) Team (leader assigned after users exist) ---------------------------
INSERT INTO teams (id, name, code, rtuppId, leaderId, isActive, createdAt, updatedAt)
VALUES (@team_id, 'Tim Operasional SCADA', 'TEAM-A', @rtupp_id, NULL, 1, @now, @now);

-- --- 3) Users --------------------------------------------------------------
-- mustChangePassword: SUPERADMIN=0 (break-glass), all others=1 (forced first login).
INSERT INTO users (id, email, password, name, role, phone, avatar, isActive, rtuppId, teamId, mustChangePassword, createdAt, updatedAt) VALUES
  -- SUPERADMIN: global scope, no rtupp/team.
  (@u_super, 'superadmin@voltreport.com', @pwd, 'Super Administrator', 'SUPERADMIN', '081200000001', NULL, 1, NULL,      NULL,     0, @now, @now),
  -- ADMIN: national admin, sees all reports (rtuppId informational only).
  (@u_admin, 'admin@voltreport.com',      @pwd, 'Administrator',       'ADMIN',      '081200000002', NULL, 1, @rtupp_id, NULL,     1, @now, @now),
  -- PETUGAS field officers; scoped to own reports, members of TEAM-A.
  (@u_pet1,  'petugas1@voltreport.com',   @pwd, 'Budi Santoso',        'PETUGAS',    '081200000003', NULL, 1, @rtupp_id, @team_id, 1, @now, @now),
  (@u_pet2,  'petugas2@voltreport.com',   @pwd, 'Siti Rahayu',         'PETUGAS',    '081200000004', NULL, 1, @rtupp_id, @team_id, 1, @now, @now),
  (@u_pet3,  'petugas3@voltreport.com',   @pwd, 'Agus Setiawan',       'PETUGAS',    '081200000005', NULL, 1, @rtupp_id, @team_id, 1, @now, @now);

-- Team leader = petugas1 (a member of TEAM-A, satisfies the leader-in-team rule).
UPDATE teams SET leaderId = @u_pet1, updatedAt = @now WHERE id = @team_id;

-- --- 4) Personil (10, realistic PLN operational roles, all under JAKSEL) ----
INSERT INTO personil (id, nip, nama, jabatan, rtuppId, isActive, createdAt, updatedAt) VALUES
  ('f8d679ba-683e-4f54-9869-be9313cbdd51', '9201010001', 'Budi Santoso',     'Pengawas Pekerjaan',     @rtupp_id, 1, @now, @now),
  ('58a48a07-c1a2-4708-91b6-71f40eba0052', '9201010002', 'Hendra Pratama',   'Pengawas K3',            @rtupp_id, 1, @now, @now),
  ('90a5dcaf-3269-4484-9c03-a38312ed0736', '9201010003', 'Rizki Aditya',     'Teknisi SCADA',          @rtupp_id, 1, @now, @now),
  ('ff4ba393-e66b-421e-a12a-cdae441b5175', '9201010004', 'Joko Susilo',      'Teknisi SCADA',          @rtupp_id, 1, @now, @now),
  ('7c444375-0d7b-45b0-be01-5d281fd6d1e7', '9201010005', 'Maya Sari',        'Operator SCADA',         @rtupp_id, 1, @now, @now),
  ('e9693e0b-5333-43f3-88ea-e4f3ee5c9fa1', '9201010006', 'Agus Setiawan',    'Operator SCADA',         @rtupp_id, 1, @now, @now),
  ('c2a88afe-bca7-4574-af50-1d24d051eb58', '9201010007', 'Dewi Lestari',     'Teknisi Telekomunikasi', @rtupp_id, 1, @now, @now),
  ('3287daf6-88f1-493a-b169-766aa97d06d0', '9201010008', 'Bambang Wijaya',   'Teknisi Telekomunikasi', @rtupp_id, 1, @now, @now),
  ('0636179c-faa0-416d-b9b8-fd3c3b3fa45d', '9201010009', 'Siti Nurhaliza',   'Pelaksana Lapangan',     @rtupp_id, 1, @now, @now),
  ('0ffeb32f-99bd-48ad-90e6-20029d25f2ba', '9201010010', 'Eko Prasetyo',     'Pelaksana Lapangan',     @rtupp_id, 1, @now, @now);

COMMIT;

-- --- OPTIONAL: frictionless UAT (skip forced first-login change for everyone) ---
-- Uncomment if testers should log straight into the app:
-- UPDATE users SET mustChangePassword = 0;

-- --- Quick verification (see 03_verify.sql for the full suite) --------------
-- SELECT role, COUNT(*) FROM users GROUP BY role;        -- SUPERADMIN=1, ADMIN=1, PETUGAS=3
-- SELECT COUNT(*) FROM personil;                         -- 10
-- SELECT COUNT(*) FROM teams WHERE leaderId IS NOT NULL; -- 1
