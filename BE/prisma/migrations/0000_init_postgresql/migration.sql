-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MASTER', 'MANAGER', 'SUPERADMIN', 'ADMIN', 'ADMIN_RTUPP', 'PETUGAS', 'NOC');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('GI', 'GH', 'GARDU');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('RTU', 'FDI', 'RECTIFIER', 'BATTERY_BANK', 'ROUTER', 'MODEM', 'RADIO');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'WARNING', 'DAMAGED', 'RETIRED');

-- CreateEnum
CREATE TYPE "CommunicationMediaType" AS ENUM ('GSM_4G', 'GSM_2G', 'RADIO_DATA', 'FO', 'ICON_GSM', 'ICON_IPVPN');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('NORMAL', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "HarStatus" AS ENUM ('NORMAL', 'WARNING', 'CRITICAL', 'OFFLINE');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PHOTO', 'BERITA_ACARA', 'MANUAL_BOOK', 'SERTIFIKAT', 'INSPECTION_DOC', 'OTHER');

-- CreateEnum
CREATE TYPE "ValidationAction" AS ENUM ('APPROVED', 'REJECTED', 'REVISION_REQUESTED');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'SUBMIT', 'VALIDATE', 'REJECT', 'EXPORT', 'LOGIN', 'LOGOUT', 'DOWNLOAD');

-- CreateEnum
CREATE TYPE "activity_logs_entityType" AS ENUM ('USER', 'LAPORAN_AWAL', 'LAPORAN_AKHIR', 'RTUPP', 'TEAM', 'ATTACHMENT');

-- CreateEnum
CREATE TYPE "attachments_category" AS ENUM ('FOTO_SEBELUM', 'FOTO_BRIEFING', 'FOTO_APD', 'FOTO_PEKERJAAN', 'FOTO_HASIL', 'LOGGER_FILE', 'SLD_FILE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'REVISED');

-- CreateEnum
CREATE TYPE "laporan_awal_status" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "laporan_akhir_statusPekerjaan" AS ENUM ('SELESAI', 'PARSIAL', 'GAGAL');

-- CreateEnum
CREATE TYPE "laporan_akhir_catatanPerangkat" AS ENUM ('NORMAL', 'RUSAK');

-- CreateEnum
CREATE TYPE "laporan_akhir_catatanBaterai" AS ENUM ('NORMAL', 'HATI_HATI', 'RUSAK');

-- CreateEnum
CREATE TYPE "laporan_akhir_statusGardu" AS ENUM ('APPDISK', 'GAGAL_RC', 'OOP', 'INSCAN', 'BERHASIL_RC', 'LAIN_LAIN');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE');

-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'REVISION_REQUIRED', 'APPROVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'REPORT_SUBMITTED', 'REPORT_APPROVED', 'REPORT_REJECTED', 'REVISION_REQUESTED', 'TICKET_CREATED', 'TICKET_CLOSED');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "ScadaGarduType" AS ENUM ('RC', 'GH', 'GI', 'GFD');

-- CreateEnum
CREATE TYPE "ScadaStatus" AS ENUM ('IN_SCAN', 'OOP');

-- CreateEnum
CREATE TYPE "WorkOrderType" AS ENUM ('CORRECTIVE', 'PREVENTIVE');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'ASSIGNED', 'ON_PROGRESS', 'WAITING_APPROVAL', 'APPROVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChecklistCondition" AS ENUM ('NORMAL', 'ABNORMAL', 'TIDAK_BEROPERASI');

-- CreateEnum
CREATE TYPE "WorkResult" AS ENUM ('BERHASIL', 'GAGAL');

-- CreateEnum
CREATE TYPE "CbStatus" AS ENUM ('NORMAL', 'TIDAK_NORMAL');

-- CreateEnum
CREATE TYPE "GiReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GiComparison" AS ENUM ('BELUM_DIBANDING', 'SESUAI', 'TIDAK_SESUAI');

-- CreateEnum
CREATE TYPE "GiAttachmentCategory" AS ENUM ('SLD', 'LOGGER', 'FOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "GiAttachmentStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(36) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "role" "UserRole" DEFAULT 'PETUGAS',
    "phone" VARCHAR(50),
    "avatar" VARCHAR(255),
    "isActive" BOOLEAN DEFAULT true,
    "mustChangePassword" BOOLEAN DEFAULT false,
    "rtuppId" VARCHAR(36),
    "teamId" VARCHAR(36),
    "roleId" VARCHAR(36),
    "createdAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" VARCHAR(36) NOT NULL,
    "userId" VARCHAR(36) NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "platform" VARCHAR(20),
    "createdAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" VARCHAR(36) NOT NULL,
    "userId" VARCHAR(36) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "familyId" VARCHAR(36) NOT NULL,
    "expiresAt" TIMESTAMPTZ(0) NOT NULL,
    "revokedAt" TIMESTAMPTZ(0),
    "replacedById" VARCHAR(36),
    "userAgent" TEXT,
    "ipAddress" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rtupps" (
    "id" VARCHAR(36) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "region" VARCHAR(255),
    "address" TEXT,
    "phone" VARCHAR(50),
    "isActive" BOOLEAN DEFAULT true,
    "organizationId" VARCHAR(36),
    "createdAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rtupps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personil" (
    "id" VARCHAR(36) NOT NULL,
    "nip" VARCHAR(50) NOT NULL,
    "nama" VARCHAR(255) NOT NULL,
    "jabatan" VARCHAR(255) NOT NULL,
    "rtuppId" VARCHAR(36) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "rtuppId" VARCHAR(36) NOT NULL,
    "leaderId" VARCHAR(36),
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_awal" (
    "id" VARCHAR(36) NOT NULL,
    "reportId" VARCHAR(50) NOT NULL,
    "hari" VARCHAR(50) NOT NULL,
    "tanggal" DATE NOT NULL,
    "nomorSPJ" VARCHAR(100) NOT NULL,
    "up3" VARCHAR(255) NOT NULL,
    "pekerjaan" TEXT NOT NULL,
    "lokasiGardu" VARCHAR(255) NOT NULL,
    "pelaksana" VARCHAR(255) NOT NULL,
    "penanggungJawab" VARCHAR(255) NOT NULL,
    "pengawasPekerjaan" VARCHAR(255),
    "pengawasManuver" VARCHAR(255),
    "pengawasK3" VARCHAR(255),
    "nomorWP" VARCHAR(100),
    "potensiBahaya" TEXT NOT NULL,
    "pengendalianRisiko" TEXT NOT NULL,
    "apd" VARCHAR(255),
    "rambuKerja" VARCHAR(255),
    "asuransiTK" VARCHAR(255),
    "wpJsahirarcSop" BOOLEAN DEFAULT false,
    "kondisiPersonil" VARCHAR(50) DEFAULT 'SEHAT',
    "potensiBahayaDijelaskan" BOOLEAN DEFAULT false,
    "apdLengkap" BOOLEAN DEFAULT false,
    "asuransiKetenagakerjaan" BOOLEAN DEFAULT false,
    "berdoaSebelumBekerja" BOOLEAN DEFAULT false,
    "jumlahPersonil" INTEGER DEFAULT 0,
    "personilSnapshot" JSONB,
    "workOrderId" VARCHAR(36),
    "cekRelay" "ChecklistCondition",
    "cekRC" "ChecklistCondition",
    "cekLR" "ChecklistCondition",
    "cekES" "ChecklistCondition",
    "cekStatusCB" "ChecklistCondition",
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "revisionNote" TEXT,
    "submittedAt" TIMESTAMPTZ(0),
    "approvedAt" TIMESTAMPTZ(0),
    "rejectedAt" TIMESTAMPTZ(0),
    "approvedById" VARCHAR(36),
    "rejectedById" VARCHAR(36),
    "updatedById" VARCHAR(36),
    "legacyStatus" "laporan_awal_status" DEFAULT 'DRAFT',
    "createdById" VARCHAR(36) NOT NULL,
    "createdAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "laporan_awal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_akhir" (
    "id" VARCHAR(36) NOT NULL,
    "reportId" VARCHAR(50) NOT NULL,
    "laporanAwalId" VARCHAR(36),
    "nomorSPJ" VARCHAR(100) NOT NULL,
    "tanggalSelesai" DATE NOT NULL,
    "up3" VARCHAR(255) NOT NULL,
    "pekerjaan" TEXT NOT NULL,
    "namaAset" VARCHAR(255) NOT NULL,
    "tagSCADA" VARCHAR(100),
    "bayPosisi" VARCHAR(100),
    "teganganNominal" VARCHAR(50),
    "detailLangkah" TEXT NOT NULL,
    "hasilTahananIsolasi" VARCHAR(100),
    "hasilPengukuranBeban" VARCHAR(100),
    "catatanHasil" TEXT,
    "statusPekerjaan" "laporan_akhir_statusPekerjaan" DEFAULT 'SELESAI',
    "durasiPekerjaan" VARCHAR(100),
    "catatanTambahan" TEXT,
    "status" "ReportStatus" DEFAULT 'DRAFT',
    "workOrderId" VARCHAR(36),
    "hasilRC" "WorkResult",
    "hasilLR" "WorkResult",
    "hasilES" "WorkResult",
    "statusCB" "CbStatus",
    "penyebab" TEXT,
    "tindakan" TEXT,
    "rekomendasi" TEXT,
    "gardu" VARCHAR(255),
    "jenisPekerjaan" VARCHAR(255),
    "asdu" VARCHAR(20),
    "ipModem" VARCHAR(50),
    "ipRTU" VARCHAR(50),
    "ipSIM1" VARCHAR(50),
    "ipSIM2" VARCHAR(50),
    "ipGTWIconPlus" VARCHAR(50),
    "ipWAN" VARCHAR(50),
    "rtuNama" VARCHAR(255),
    "rtuType" VARCHAR(100),
    "mediaNama" VARCHAR(255),
    "mediaType" VARCHAR(100),
    "rectifierNama" VARCHAR(255),
    "rectifierType" VARCHAR(100),
    "bateraiNama" VARCHAR(255),
    "bateraiType" VARCHAR(100),
    "catatanRTU" "laporan_akhir_catatanPerangkat",
    "catatanMedia" "laporan_akhir_catatanPerangkat",
    "catatanRectifier" "laporan_akhir_catatanPerangkat",
    "catatanBaterai" "laporan_akhir_catatanBaterai",
    "catatanLain" TEXT,
    "statusSebelum" "laporan_akhir_statusGardu",
    "statusSesudah" "laporan_akhir_statusGardu",
    "pengawas" VARCHAR(255),
    "pelaksana" VARCHAR(255),
    "createdById" VARCHAR(36) NOT NULL,
    "createdAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,
    "updatedById" VARCHAR(36),
    "submittedAt" TIMESTAMPTZ(0),
    "approvedAt" TIMESTAMPTZ(0),
    "rejectedAt" TIMESTAMPTZ(0),
    "approvedById" VARCHAR(36),
    "rejectedById" VARCHAR(36),
    "validatedAt" TIMESTAMPTZ(0),

    CONSTRAINT "laporan_akhir_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" VARCHAR(36) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "laporanAwalId" VARCHAR(36),
    "laporanAkhirId" VARCHAR(36),
    "category" "attachments_category" NOT NULL,
    "uploadedById" VARCHAR(36) NOT NULL,
    "uploadedAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_validations" (
    "id" VARCHAR(36) NOT NULL,
    "laporanAwalId" VARCHAR(36),
    "laporanAkhirId" VARCHAR(36),
    "validatorId" VARCHAR(36) NOT NULL,
    "status" "ValidationAction" NOT NULL,
    "notes" TEXT,
    "validatedAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" VARCHAR(36) NOT NULL,
    "userId" VARCHAR(36) NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "entityType" "activity_logs_entityType" NOT NULL,
    "entityId" VARCHAR(36),
    "laporanAwalId" VARCHAR(36),
    "laporanAkhirId" VARCHAR(36),
    "details" TEXT,
    "ipAddress" VARCHAR(100),
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" VARCHAR(36) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "locationType" "LocationType" NOT NULL,
    "up3" VARCHAR(150),
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),
    "deletedAt" TIMESTAMPTZ(0),
    "supplyFeederId" VARCHAR(36),
    "rtuppId" VARCHAR(36),

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feeders" (
    "id" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "bayId" VARCHAR(36),
    "feederCode" VARCHAR(50) NOT NULL,
    "feederName" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "feeders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "feederId" VARCHAR(36),
    "bayId" VARCHAR(36),
    "parentAssetId" VARCHAR(36),
    "assetTypeId" VARCHAR(36),
    "assetType" "AssetType" NOT NULL,
    "assetCode" VARCHAR(100) NOT NULL,
    "assetName" VARCHAR(255) NOT NULL,
    "brand" VARCHAR(150),
    "model" VARCHAR(150),
    "serialNumber" VARCHAR(150),
    "tahunOperasi" INTEGER,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "protocol" VARCHAR(100),
    "asdu" VARCHAR(100),
    "linkAddress" VARCHAR(100),
    "pairChannel" VARCHAR(100),
    "masterIp1" VARCHAR(50),
    "masterIp2" VARCHAR(50),
    "scadaRtuName" VARCHAR(100),
    "operState" VARCHAR(20),
    "adminState" VARCHAR(20),
    "commLastSeenAt" TIMESTAMPTZ(0),
    "commStateChangedAt" TIMESTAMPTZ(0),
    "batteryCount" INTEGER,
    "capacity" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_sim_cards" (
    "id" VARCHAR(36) NOT NULL,
    "assetId" VARCHAR(36) NOT NULL,
    "simSlot" INTEGER NOT NULL,
    "provider" VARCHAR(100),
    "phoneNumber" VARCHAR(50),
    "iccid" VARCHAR(100),
    "ipAddress" VARCHAR(50),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),

    CONSTRAINT "asset_sim_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_media" (
    "id" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "mediaType" "CommunicationMediaType" NOT NULL,
    "provider" VARCHAR(150),
    "status" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "communication_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "inspectionDate" DATE NOT NULL,
    "inspectorId" VARCHAR(36) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_findings" (
    "id" VARCHAR(36) NOT NULL,
    "inspectionId" VARCHAR(36) NOT NULL,
    "assetId" VARCHAR(36) NOT NULL,
    "status" "InspectionStatus" NOT NULL,
    "finding" TEXT,
    "recommendation" TEXT,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),

    CONSTRAINT "inspection_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_photos" (
    "id" VARCHAR(36) NOT NULL,
    "findingId" VARCHAR(36) NOT NULL,
    "assetId" VARCHAR(36) NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "caption" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),

    CONSTRAINT "inspection_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "har_reports" (
    "id" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "reportDate" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),

    CONSTRAINT "har_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "har_details" (
    "id" VARCHAR(36) NOT NULL,
    "harReportId" VARCHAR(36) NOT NULL,
    "assetId" VARCHAR(36) NOT NULL,
    "status" "HarStatus" NOT NULL,
    "analysis" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),

    CONSTRAINT "har_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36),
    "assetId" VARCHAR(36),
    "documentType" "DocumentType" NOT NULL,
    "documentName" VARCHAR(255) NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_reports" (
    "id" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36),
    "reportNumber" VARCHAR(100) NOT NULL,
    "reportType" VARCHAR(50) NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "generatedBy" VARCHAR(36),
    "generatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "format" VARCHAR(10) NOT NULL DEFAULT 'PDF',
    "sourceType" VARCHAR(30),
    "sourceId" VARCHAR(36),
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" VARCHAR(255),
    "templateKey" VARCHAR(50),
    "fileSize" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "generated_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_signatures" (
    "id" VARCHAR(36) NOT NULL,
    "reportId" VARCHAR(36) NOT NULL,
    "reportNumber" VARCHAR(100) NOT NULL,
    "sourceType" VARCHAR(30) NOT NULL,
    "sourceId" VARCHAR(36) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "algorithm" VARCHAR(20) NOT NULL DEFAULT 'Ed25519',
    "keyId" VARCHAR(64) NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "fileHash" VARCHAR(64) NOT NULL,
    "signature" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "verifyUrl" TEXT NOT NULL,
    "issuer" VARCHAR(255) NOT NULL,
    "signedBy" VARCHAR(36),
    "signerName" VARCHAR(150),
    "status" VARCHAR(20) NOT NULL DEFAULT 'VALID',
    "revokedAt" TIMESTAMPTZ(0),
    "revokedBy" VARCHAR(36),
    "revokedReason" VARCHAR(255),
    "verifyCount" INTEGER NOT NULL DEFAULT 0,
    "lastVerifiedAt" TIMESTAMPTZ(0),
    "signedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_downloads" (
    "id" VARCHAR(36) NOT NULL,
    "reportId" VARCHAR(36) NOT NULL,
    "downloadedBy" VARCHAR(36),
    "ipAddress" VARCHAR(45),
    "downloadedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" VARCHAR(36) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "fileUrl" TEXT,
    "importType" VARCHAR(50) NOT NULL DEFAULT 'ASSET',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMPTZ(0),
    "finishedAt" TIMESTAMPTZ(0),
    "createdBy" VARCHAR(36),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_errors" (
    "id" VARCHAR(36) NOT NULL,
    "importJobId" VARCHAR(36) NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "rawData" JSONB,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" VARCHAR(36) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "up3s" (
    "id" VARCHAR(36) NOT NULL,
    "rtuppId" VARCHAR(36) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "up3s_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_types" (
    "id" VARCHAR(36) NOT NULL,
    "assetCategoryId" VARCHAR(36) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_daily" (
    "id" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "performanceDate" DATE NOT NULL,
    "performanceStatus" INTEGER NOT NULL,
    "score" INTEGER,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "ticketNumber" VARCHAR(100) NOT NULL,
    "category" VARCHAR(100),
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedTo" VARCHAR(36),
    "notes" TEXT,
    "openedAt" TIMESTAMPTZ(0),
    "closedAt" TIMESTAMPTZ(0),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" VARCHAR(36) NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" VARCHAR(36) NOT NULL,
    "action" "AuditAction" NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "performedBy" VARCHAR(36),
    "performedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_geometries" (
    "id" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "geometry" TEXT,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_geometries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" VARCHAR(36) NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" VARCHAR(36) NOT NULL,
    "currentState" "WorkflowState" NOT NULL DEFAULT 'DRAFT',
    "createdBy" VARCHAR(36),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_transitions" (
    "id" VARCHAR(36) NOT NULL,
    "instanceId" VARCHAR(36) NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" VARCHAR(36) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "fromState" "WorkflowState",
    "toState" "WorkflowState" NOT NULL,
    "performedBy" VARCHAR(36),
    "performedByRole" VARCHAR(50),
    "comment" TEXT,
    "reason" TEXT,
    "performedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" VARCHAR(36) NOT NULL,
    "userId" VARCHAR(36) NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" VARCHAR(100),
    "entityId" VARCHAR(36),
    "data" TEXT,
    "dedupeKey" VARCHAR(255) NOT NULL,
    "readAt" TIMESTAMPTZ(0),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" VARCHAR(36) NOT NULL,
    "notificationId" VARCHAR(36) NOT NULL,
    "channel" VARCHAR(20) NOT NULL DEFAULT 'PUSH',
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(0),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" VARCHAR(255) NOT NULL,
    "userId" VARCHAR(36),
    "scope" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    "statusCode" INTEGER,
    "responseBody" TEXT,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "scada_gardu" (
    "id" VARCHAR(36) NOT NULL,
    "garduType" "ScadaGarduType" NOT NULL,
    "code" VARCHAR(150) NOT NULL,
    "up3" VARCHAR(150),
    "rtupp" VARCHAR(100),
    "wilayah" VARCHAR(100),
    "avaYtd" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "currentStatus" "ScadaStatus",
    "asOfDate" DATE,
    "daily" JSONB,
    "sourceFile" VARCHAR(255),
    "importedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scada_gardu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspeksi_gardu_records" (
    "id" VARCHAR(36) NOT NULL,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sumberFile" VARCHAR(20) NOT NULL,
    "tanggalPekerjaan" DATE,
    "userEmail" VARCHAR(255),
    "jenisPekerjaan" VARCHAR(150),
    "up3" VARCHAR(150),
    "kodeGardu" VARCHAR(100),
    "penyulang" VARCHAR(150),
    "sumberListrik220" VARCHAR(100),
    "supplyTr" VARCHAR(100),
    "mcbSumberRectifier" VARCHAR(100),
    "merkRectifier" VARCHAR(150),
    "typeRectifier" VARCHAR(150),
    "serialRectifier" VARCHAR(150),
    "kondisiRectifier" VARCHAR(100),
    "hasilUkurMcb220" DOUBLE PRECISION,
    "hasilUkurMcbBat48" DOUBLE PRECISION,
    "hasilUkurMcbLoad48" DOUBLE PRECISION,
    "keteranganRectifier" TEXT,
    "kesimpulanRectifier" VARCHAR(50),
    "kategoriRectifier" VARCHAR(100),
    "jenisBaterai" VARCHAR(100),
    "merkBaterai" VARCHAR(150),
    "typeBaterai" VARCHAR(150),
    "jumlahCell" INTEGER,
    "levelAirBaterai" VARCHAR(100),
    "backupBaterai" VARCHAR(100),
    "keteranganBaterai" TEXT,
    "kesimpulanBaterai" VARCHAR(50),
    "kategoriBaterai" VARCHAR(100),
    "merkRtu" VARCHAR(150),
    "typeRtu" VARCHAR(150),
    "serialRtu" VARCHAR(150),
    "kondisiRtu" VARCHAR(100),
    "kondisiDisplayRtu" VARCHAR(100),
    "keteranganRtu" TEXT,
    "kesimpulanRtu" VARCHAR(50),
    "kategoriRtu" VARCHAR(100),
    "merkMedia" VARCHAR(150),
    "typeMedia" VARCHAR(150),
    "serialMedia" VARCHAR(150),
    "kondisiMedia" VARCHAR(100),
    "kondisiAntena" VARCHAR(100),
    "keteranganMedia" TEXT,
    "kesimpulanMedia" VARCHAR(50),
    "kategoriMedia" VARCHAR(100),
    "statusScada" VARCHAR(50),
    "statusRc" VARCHAR(50),
    "keteranganKubikel" TEXT,
    "catatan" TEXT,
    "pelaksana" VARCHAR(255),
    "tanggalUpdate" TIMESTAMPTZ(0),
    "locationId" VARCHAR(36),

    CONSTRAINT "inspeksi_gardu_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "har_gardu_records" (
    "id" VARCHAR(36) NOT NULL,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sumberFile" VARCHAR(20) NOT NULL,
    "tanggalPekerjaan" DATE,
    "userEmail" VARCHAR(255),
    "jenisPekerjaan" VARCHAR(150),
    "up3" VARCHAR(150),
    "kodeGardu" VARCHAR(100),
    "penyulang" VARCHAR(150),
    "sumberListrik220" VARCHAR(100),
    "supplyTr" VARCHAR(100),
    "mcbSumberRectifier" VARCHAR(100),
    "merkRectifier" VARCHAR(150),
    "typeRectifier" VARCHAR(150),
    "serialRectifier" VARCHAR(150),
    "kondisiRectifier" VARCHAR(100),
    "hasilUkurMcb220" DOUBLE PRECISION,
    "hasilUkurMcbBat48" DOUBLE PRECISION,
    "hasilUkurMcbLoad48" DOUBLE PRECISION,
    "keteranganRectifier" TEXT,
    "kesimpulanRectifier" VARCHAR(50),
    "kategoriRectifier" VARCHAR(100),
    "jenisBaterai" VARCHAR(100),
    "merkBaterai" VARCHAR(150),
    "typeBaterai" VARCHAR(150),
    "jumlahCell" INTEGER,
    "levelAirBaterai" VARCHAR(100),
    "backupBaterai" VARCHAR(100),
    "keteranganBaterai" TEXT,
    "kesimpulanBaterai" VARCHAR(50),
    "kategoriBaterai" VARCHAR(100),
    "merkRtu" VARCHAR(150),
    "typeRtu" VARCHAR(150),
    "serialRtu" VARCHAR(150),
    "kondisiRtu" VARCHAR(100),
    "kondisiDisplayRtu" VARCHAR(100),
    "keteranganRtu" TEXT,
    "kesimpulanRtu" VARCHAR(50),
    "kategoriRtu" VARCHAR(100),
    "merkMedia" VARCHAR(150),
    "typeMedia" VARCHAR(150),
    "serialMedia" VARCHAR(150),
    "kondisiMedia" VARCHAR(100),
    "kondisiAntena" VARCHAR(100),
    "keteranganMedia" TEXT,
    "kesimpulanMedia" VARCHAR(50),
    "kategoriMedia" VARCHAR(100),
    "penyebabGangguan" TEXT,
    "analisaGangguan" TEXT,
    "langkahPekerjaan" TEXT,
    "statusGarduSebelum" VARCHAR(100),
    "statusGarduSesudah" VARCHAR(100),
    "statusPekerjaan" VARCHAR(100),
    "statusScada" VARCHAR(50),
    "statusRc" VARCHAR(100),
    "keteranganKubikel" TEXT,
    "adaAco" VARCHAR(20),
    "jumlahAco" INTEGER,
    "jumlahAcoIntegrasi" INTEGER,
    "jumlahAcoTidak" INTEGER,
    "catatanAcoTidak" TEXT,
    "catatan" TEXT,
    "pelaksana" VARCHAR(255),
    "tanggalUpdate" TIMESTAMPTZ(0),
    "locationId" VARCHAR(36),

    CONSTRAINT "har_gardu_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" VARCHAR(36) NOT NULL,
    "sessionId" VARCHAR(64) NOT NULL,
    "userId" VARCHAR(36),
    "role" VARCHAR(30),
    "rtuppId" VARCHAR(36),
    "channel" VARCHAR(20) NOT NULL DEFAULT 'in_app',
    "question" TEXT NOT NULL,
    "intent" VARCHAR(50),
    "confidence" DOUBLE PRECISION,
    "mode" VARCHAR(20),
    "finalAction" VARCHAR(100),
    "clarification" VARCHAR(120),
    "provider" VARCHAR(30),
    "replyKind" VARCHAR(20),
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_feedback" (
    "id" VARCHAR(36) NOT NULL,
    "conversationId" VARCHAR(36) NOT NULL,
    "userId" VARCHAR(36),
    "rating" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_user_preferences" (
    "id" VARCHAR(36) NOT NULL,
    "userId" VARCHAR(36) NOT NULL,
    "prefs" JSONB,
    "contextSnapshot" JSONB,
    "learnedPrefs" JSONB,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_aliases" (
    "id" VARCHAR(36) NOT NULL,
    "userId" VARCHAR(36),
    "phrase" VARCHAR(120) NOT NULL,
    "concept" VARCHAR(60) NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_intents" (
    "id" VARCHAR(36) NOT NULL,
    "intentId" VARCHAR(50) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "queryId" VARCHAR(60),
    "allowedRoles" VARCHAR(120) NOT NULL,
    "examples" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bays" (
    "id" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "voltageLevel" VARCHAR(50),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "bays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" VARCHAR(36) NOT NULL,
    "woNumber" VARCHAR(100) NOT NULL,
    "type" "WorkOrderType" NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "locationId" VARCHAR(36) NOT NULL,
    "bayId" VARCHAR(36),
    "feederId" VARCHAR(36),
    "assetId" VARCHAR(36),
    "teamId" VARCHAR(36),
    "scadaGarduId" VARCHAR(36),
    "scadaEventRef" VARCHAR(255),
    "dueDate" DATE,
    "createdById" VARCHAR(36),
    "startedAt" TIMESTAMPTZ(0),
    "submittedAt" TIMESTAMPTZ(0),
    "approvedAt" TIMESTAMPTZ(0),
    "rejectedAt" TIMESTAMPTZ(0),
    "closedAt" TIMESTAMPTZ(0),
    "approvedById" VARCHAR(36),
    "rejectedById" VARCHAR(36),
    "revisionNote" TEXT,
    "hasilRC" "WorkResult",
    "hasilLR" "WorkResult",
    "hasilES" "WorkResult",
    "statusCB" "CbStatus",
    "penyebab" TEXT,
    "tindakan" TEXT,
    "rekomendasi" TEXT,
    "requiredReports" JSONB,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_attachments" (
    "id" VARCHAR(36) NOT NULL,
    "workOrderId" VARCHAR(36) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "category" VARCHAR(50),
    "uploadedById" VARCHAR(36),
    "uploadedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_gi" (
    "id" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "feederId" VARCHAR(36),
    "workOrderId" VARCHAR(36),
    "up3" VARCHAR(150),
    "reportDate" DATE NOT NULL,
    "pelaksana" VARCHAR(255),
    "inspectorId" VARCHAR(36),
    "status" "GiReportStatus" NOT NULL DEFAULT 'DRAFT',
    "comparisonResult" "GiComparison" NOT NULL DEFAULT 'BELUM_DIBANDING',
    "scadaRtuName" VARCHAR(255),
    "scadaSnapshotId" VARCHAR(36),
    "statusPmt" VARCHAR(50),
    "statusPmtDiMaster" VARCHAR(50),
    "statusLr" VARCHAR(50),
    "statusLrDiMaster" VARCHAR(50),
    "esDiMaster" VARCHAR(50),
    "mpufDiMaster" VARCHAR(50),
    "rectifier" JSONB,
    "rectifierBackup" JSONB,
    "baterai" JSONB,
    "serialDevice" JSONB,
    "rtuIo" JSONB,
    "kubikel" JSONB,
    "relayProteksi" JSONB,
    "notes" TEXT,
    "catatan" TEXT,
    "submittedAt" TIMESTAMPTZ(0),
    "validatedAt" TIMESTAMPTZ(0),
    "validatedBy" VARCHAR(36),
    "validationNote" TEXT,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "laporan_gi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_har_gi" (
    "id" VARCHAR(36) NOT NULL,
    "workOrderId" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "feederId" VARCHAR(36),
    "assetId" VARCHAR(36),
    "up3" VARCHAR(150),
    "reportDate" DATE NOT NULL,
    "ketKunjungan" VARCHAR(255),
    "pelaksana" VARCHAR(255),
    "pengawas" VARCHAR(255),
    "inspectorId" VARCHAR(36),
    "status" "GiReportStatus" NOT NULL DEFAULT 'DRAFT',
    "scadaRtuName" VARCHAR(255),
    "statusGarduSebelum" VARCHAR(50),
    "statusGarduSesudah" VARCHAR(50),
    "statusPekerjaan" VARCHAR(50),
    "penyebabGangguan" JSONB,
    "io" JSONB,
    "relay" JSONB,
    "rectifier" JSONB,
    "baterai" JSONB,
    "serialDevice" JSONB,
    "cctv" JSONB,
    "penanganan" JSONB,
    "submittedAt" TIMESTAMPTZ(0),
    "validatedAt" TIMESTAMPTZ(0),
    "validatedBy" VARCHAR(36),
    "validationNote" TEXT,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "laporan_har_gi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_gi_attachments" (
    "id" VARCHAR(36) NOT NULL,
    "laporanGiId" VARCHAR(36) NOT NULL,
    "category" "GiAttachmentCategory" NOT NULL,
    "status" "GiAttachmentStatus" NOT NULL DEFAULT 'READY',
    "fileName" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" VARCHAR(500) NOT NULL,
    "originalPath" VARCHAR(500),
    "thumbnailPath" VARCHAR(500),
    "durationSec" INTEGER,
    "errorMessage" VARCHAR(500),
    "uploadedById" VARCHAR(36),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "laporan_gi_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_inspeksi_gh" (
    "id" VARCHAR(36) NOT NULL,
    "workOrderId" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "feederId" VARCHAR(36),
    "up3" VARCHAR(150),
    "reportDate" DATE NOT NULL,
    "pelaksana" VARCHAR(255),
    "inspectorId" VARCHAR(36),
    "status" "GiReportStatus" NOT NULL DEFAULT 'DRAFT',
    "statusRc" VARCHAR(50),
    "statusCubicle" VARCHAR(50),
    "statusCubicleMaster" VARCHAR(50),
    "statusLr" VARCHAR(50),
    "statusLrMaster" VARCHAR(50),
    "supplyTr" JSONB,
    "rectifier" JSONB,
    "baterai" JSONB,
    "rtu" JSONB,
    "media1" JSONB,
    "media2" JSONB,
    "kubikel" JSONB,
    "fdiRelay" JSONB,
    "aco" JSONB,
    "notes" TEXT,
    "catatan" TEXT,
    "submittedAt" TIMESTAMPTZ(0),
    "validatedAt" TIMESTAMPTZ(0),
    "validatedBy" VARCHAR(36),
    "validationNote" TEXT,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "laporan_inspeksi_gh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_har_gh" (
    "id" VARCHAR(36) NOT NULL,
    "workOrderId" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "feederId" VARCHAR(36),
    "up3" VARCHAR(150),
    "reportDate" DATE NOT NULL,
    "pelaksana" VARCHAR(255),
    "inspectorId" VARCHAR(36),
    "status" "GiReportStatus" NOT NULL DEFAULT 'DRAFT',
    "statusRc" VARCHAR(50),
    "statusCubicle" VARCHAR(50),
    "statusCubicleMaster" VARCHAR(50),
    "statusLr" VARCHAR(50),
    "statusLrMaster" VARCHAR(50),
    "statusGarduSebelum" VARCHAR(50),
    "statusGarduSesudah" VARCHAR(50),
    "statusPekerjaan" VARCHAR(50),
    "penyebabGangguan" JSONB,
    "supplyTr" JSONB,
    "rectifier" JSONB,
    "baterai" JSONB,
    "rtu" JSONB,
    "media1" JSONB,
    "media2" JSONB,
    "kubikel" JSONB,
    "fdiRelay" JSONB,
    "aco" JSONB,
    "penanganan" JSONB,
    "notes" TEXT,
    "catatan" TEXT,
    "submittedAt" TIMESTAMPTZ(0),
    "validatedAt" TIMESTAMPTZ(0),
    "validatedBy" VARCHAR(36),
    "validationNote" TEXT,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "laporan_har_gh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_inspeksi_gh_attachments" (
    "id" VARCHAR(36) NOT NULL,
    "laporanInspeksiGhId" VARCHAR(36) NOT NULL,
    "category" "GiAttachmentCategory" NOT NULL,
    "status" "GiAttachmentStatus" NOT NULL DEFAULT 'READY',
    "fileName" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" VARCHAR(500) NOT NULL,
    "originalPath" VARCHAR(500),
    "thumbnailPath" VARCHAR(500),
    "durationSec" INTEGER,
    "errorMessage" VARCHAR(500),
    "uploadedById" VARCHAR(36),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "laporan_inspeksi_gh_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_har_gh_attachments" (
    "id" VARCHAR(36) NOT NULL,
    "laporanHarGhId" VARCHAR(36) NOT NULL,
    "category" "GiAttachmentCategory" NOT NULL,
    "status" "GiAttachmentStatus" NOT NULL DEFAULT 'READY',
    "fileName" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" VARCHAR(500) NOT NULL,
    "originalPath" VARCHAR(500),
    "thumbnailPath" VARCHAR(500),
    "durationSec" INTEGER,
    "errorMessage" VARCHAR(500),
    "uploadedById" VARCHAR(36),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "laporan_har_gh_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_inspeksi_mp" (
    "id" VARCHAR(36) NOT NULL,
    "workOrderId" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "feederId" VARCHAR(36),
    "up3" VARCHAR(150),
    "reportDate" DATE NOT NULL,
    "pelaksana" VARCHAR(255),
    "inspectorId" VARCHAR(36),
    "status" "GiReportStatus" NOT NULL DEFAULT 'DRAFT',
    "statusRc" VARCHAR(50),
    "statusCubicle" VARCHAR(50),
    "statusCubicleMaster" VARCHAR(50),
    "statusLr" VARCHAR(50),
    "statusLrMaster" VARCHAR(50),
    "supplyTr" JSONB,
    "rectifier" JSONB,
    "baterai" JSONB,
    "rtu" JSONB,
    "media1" JSONB,
    "media2" JSONB,
    "kubikel" JSONB,
    "fdiRelay" JSONB,
    "aco" JSONB,
    "notes" TEXT,
    "catatan" TEXT,
    "submittedAt" TIMESTAMPTZ(0),
    "validatedAt" TIMESTAMPTZ(0),
    "validatedBy" VARCHAR(36),
    "validationNote" TEXT,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "laporan_inspeksi_mp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_har_mp" (
    "id" VARCHAR(36) NOT NULL,
    "workOrderId" VARCHAR(36) NOT NULL,
    "locationId" VARCHAR(36) NOT NULL,
    "feederId" VARCHAR(36),
    "up3" VARCHAR(150),
    "reportDate" DATE NOT NULL,
    "pelaksana" VARCHAR(255),
    "inspectorId" VARCHAR(36),
    "status" "GiReportStatus" NOT NULL DEFAULT 'DRAFT',
    "statusRc" VARCHAR(50),
    "statusCubicle" VARCHAR(50),
    "statusCubicleMaster" VARCHAR(50),
    "statusLr" VARCHAR(50),
    "statusLrMaster" VARCHAR(50),
    "statusGarduSebelum" VARCHAR(50),
    "statusGarduSesudah" VARCHAR(50),
    "statusPekerjaan" VARCHAR(50),
    "penyebabGangguan" JSONB,
    "supplyTr" JSONB,
    "rectifier" JSONB,
    "baterai" JSONB,
    "rtu" JSONB,
    "media1" JSONB,
    "media2" JSONB,
    "kubikel" JSONB,
    "fdiRelay" JSONB,
    "aco" JSONB,
    "penanganan" JSONB,
    "notes" TEXT,
    "catatan" TEXT,
    "submittedAt" TIMESTAMPTZ(0),
    "validatedAt" TIMESTAMPTZ(0),
    "validatedBy" VARCHAR(36),
    "validationNote" TEXT,
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(36),
    "updatedBy" VARCHAR(36),
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "laporan_har_mp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_inspeksi_mp_attachments" (
    "id" VARCHAR(36) NOT NULL,
    "laporanInspeksiMpId" VARCHAR(36) NOT NULL,
    "category" "GiAttachmentCategory" NOT NULL,
    "status" "GiAttachmentStatus" NOT NULL DEFAULT 'READY',
    "fileName" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" VARCHAR(500) NOT NULL,
    "originalPath" VARCHAR(500),
    "thumbnailPath" VARCHAR(500),
    "durationSec" INTEGER,
    "errorMessage" VARCHAR(500),
    "uploadedById" VARCHAR(36),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "laporan_inspeksi_mp_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_har_mp_attachments" (
    "id" VARCHAR(36) NOT NULL,
    "laporanHarMpId" VARCHAR(36) NOT NULL,
    "category" "GiAttachmentCategory" NOT NULL,
    "status" "GiAttachmentStatus" NOT NULL DEFAULT 'READY',
    "fileName" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" VARCHAR(500) NOT NULL,
    "originalPath" VARCHAR(500),
    "thumbnailPath" VARCHAR(500),
    "durationSec" INTEGER,
    "errorMessage" VARCHAR(500),
    "uploadedById" VARCHAR(36),
    "createdAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(0),

    CONSTRAINT "laporan_har_mp_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scada_snapshots" (
    "id" VARCHAR(36) NOT NULL,
    "uploadedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" VARCHAR(36) NOT NULL,
    "fileType" VARCHAR(10) NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "totalUp" INTEGER NOT NULL,
    "totalDown" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "scada_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scada_rtu_rows" (
    "id" VARCHAR(36) NOT NULL,
    "snapshotId" VARCHAR(36) NOT NULL,
    "rtuName" VARCHAR(100) NOT NULL,
    "rtuText" VARCHAR(255),
    "operState" VARCHAR(10) NOT NULL,
    "adminState" VARCHAR(10),
    "protocol" VARCHAR(20),
    "pairNr" INTEGER,
    "channelPrimary" INTEGER,
    "server" VARCHAR(50),
    "asdu" VARCHAR(50),
    "locationId" VARCHAR(36),

    CONSTRAINT "scada_rtu_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scada_line_rows" (
    "id" VARCHAR(36) NOT NULL,
    "snapshotId" VARCHAR(36) NOT NULL,
    "pairId" INTEGER,
    "channelId" INTEGER,
    "ifsServer" VARCHAR(50),
    "channelName" VARCHAR(100),
    "channelText" VARCHAR(255),
    "adminState" VARCHAR(10),
    "operState" VARCHAR(10),
    "assigned" VARCHAR(10),
    "dataXfr" VARCHAR(10),
    "deviceType" VARCHAR(30),
    "ipAddr" VARCHAR(100),
    "port" VARCHAR(50),

    CONSTRAINT "scada_line_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_user_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_user_role" ON "users"("role");

-- CreateIndex
CREATE INDEX "idx_user_rtupp" ON "users"("rtuppId");

-- CreateIndex
CREATE INDEX "idx_user_team" ON "users"("teamId");

-- CreateIndex
CREATE INDEX "idx_user_role_id" ON "users"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "token" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_device_token_user" ON "device_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "token_hash" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "idx_refresh_token_user" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "idx_refresh_token_family" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_rtupp_code" ON "rtupps"("code");

-- CreateIndex
CREATE INDEX "idx_rtupp_code" ON "rtupps"("code");

-- CreateIndex
CREATE INDEX "idx_rtupp_organization" ON "rtupps"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "nip" ON "personil"("nip");

-- CreateIndex
CREATE INDEX "idx_personil_rtupp" ON "personil"("rtuppId");

-- CreateIndex
CREATE INDEX "idx_personil_active" ON "personil"("isActive");

-- CreateIndex
CREATE INDEX "idx_personil_nip" ON "personil"("nip");

-- CreateIndex
CREATE UNIQUE INDEX "uq_team_code" ON "teams"("code");

-- CreateIndex
CREATE INDEX "idx_team_code" ON "teams"("code");

-- CreateIndex
CREATE INDEX "idx_team_rtupp" ON "teams"("rtuppId");

-- CreateIndex
CREATE INDEX "leaderId" ON "teams"("leaderId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_laporan_awal_reportId" ON "laporan_awal"("reportId");

-- CreateIndex
CREATE INDEX "idx_laporan_awal_createdBy" ON "laporan_awal"("createdById");

-- CreateIndex
CREATE INDEX "idx_laporan_awal_reportId" ON "laporan_awal"("reportId");

-- CreateIndex
CREATE INDEX "idx_laporan_awal_status" ON "laporan_awal"("status");

-- CreateIndex
CREATE INDEX "idx_laporan_awal_wo" ON "laporan_awal"("workOrderId");

-- CreateIndex
CREATE INDEX "idx_laporan_awal_tanggal" ON "laporan_awal"("tanggal");

-- CreateIndex
CREATE INDEX "idx_laporan_awal_created" ON "laporan_awal"("createdAt");

-- CreateIndex
CREATE INDEX "idx_laporan_awal_status_created" ON "laporan_awal"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "uq_laporan_akhir_reportId" ON "laporan_akhir"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_laporan_akhir_laporanAwalId" ON "laporan_akhir"("laporanAwalId");

-- CreateIndex
CREATE INDEX "idx_laporan_akhir_createdBy" ON "laporan_akhir"("createdById");

-- CreateIndex
CREATE INDEX "idx_laporan_akhir_reportId" ON "laporan_akhir"("reportId");

-- CreateIndex
CREATE INDEX "idx_laporan_akhir_status" ON "laporan_akhir"("status");

-- CreateIndex
CREATE INDEX "idx_laporan_akhir_wo" ON "laporan_akhir"("workOrderId");

-- CreateIndex
CREATE INDEX "idx_laporan_akhir_created" ON "laporan_akhir"("createdAt");

-- CreateIndex
CREATE INDEX "idx_laporan_akhir_status_created" ON "laporan_akhir"("status", "createdAt");

-- CreateIndex
CREATE INDEX "idx_laporan_akhir_tanggal_selesai" ON "laporan_akhir"("tanggalSelesai");

-- CreateIndex
CREATE INDEX "idx_attachment_category" ON "attachments"("category");

-- CreateIndex
CREATE INDEX "idx_attachment_laporan_akhir" ON "attachments"("laporanAkhirId");

-- CreateIndex
CREATE INDEX "idx_attachment_laporan_awal" ON "attachments"("laporanAwalId");

-- CreateIndex
CREATE INDEX "uploadedById" ON "attachments"("uploadedById");

-- CreateIndex
CREATE INDEX "idx_validation_date" ON "report_validations"("validatedAt");

-- CreateIndex
CREATE INDEX "idx_validation_laporan_akhir" ON "report_validations"("laporanAkhirId");

-- CreateIndex
CREATE INDEX "idx_validation_laporan_awal" ON "report_validations"("laporanAwalId");

-- CreateIndex
CREATE INDEX "idx_validation_validator" ON "report_validations"("validatorId");

-- CreateIndex
CREATE INDEX "idx_log_action" ON "activity_logs"("action");

-- CreateIndex
CREATE INDEX "idx_log_created" ON "activity_logs"("createdAt");

-- CreateIndex
CREATE INDEX "idx_log_entity_type" ON "activity_logs"("entityType");

-- CreateIndex
CREATE INDEX "idx_log_user" ON "activity_logs"("userId");

-- CreateIndex
CREATE INDEX "laporanAkhirId" ON "activity_logs"("laporanAkhirId");

-- CreateIndex
CREATE INDEX "idx_activity_logs_laporanAwalId" ON "activity_logs"("laporanAwalId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_location_code" ON "locations"("code");

-- CreateIndex
CREATE INDEX "idx_locations_code" ON "locations"("code");

-- CreateIndex
CREATE INDEX "idx_locations_type" ON "locations"("locationType");

-- CreateIndex
CREATE INDEX "idx_locations_up3" ON "locations"("up3");

-- CreateIndex
CREATE INDEX "idx_locations_supply_feeder" ON "locations"("supplyFeederId");

-- CreateIndex
CREATE INDEX "idx_locations_rtupp" ON "locations"("rtuppId");

-- CreateIndex
CREATE INDEX "idx_locations_geo" ON "locations"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "idx_feeders_location" ON "feeders"("locationId");

-- CreateIndex
CREATE INDEX "idx_feeders_bay" ON "feeders"("bayId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_feeder_location_code" ON "feeders"("locationId", "feederCode");

-- CreateIndex
CREATE UNIQUE INDEX "uq_asset_code" ON "assets"("assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "uq_asset_serial" ON "assets"("serialNumber");

-- CreateIndex
CREATE INDEX "idx_assets_type" ON "assets"("assetType");

-- CreateIndex
CREATE INDEX "idx_assets_location" ON "assets"("locationId");

-- CreateIndex
CREATE INDEX "idx_assets_feeder" ON "assets"("feederId");

-- CreateIndex
CREATE INDEX "idx_assets_bay" ON "assets"("bayId");

-- CreateIndex
CREATE INDEX "idx_assets_parent" ON "assets"("parentAssetId");

-- CreateIndex
CREATE INDEX "idx_assets_status" ON "assets"("status");

-- CreateIndex
CREATE INDEX "idx_assets_asset_type" ON "assets"("assetTypeId");

-- CreateIndex
CREATE INDEX "idx_assets_scada_rtu_name" ON "assets"("scadaRtuName");

-- CreateIndex
CREATE INDEX "idx_assets_oper_state" ON "assets"("operState");

-- CreateIndex
CREATE INDEX "idx_sim_asset" ON "asset_sim_cards"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sim_asset_slot" ON "asset_sim_cards"("assetId", "simSlot");

-- CreateIndex
CREATE INDEX "idx_comm_media_location" ON "communication_media"("locationId");

-- CreateIndex
CREATE INDEX "idx_comm_media_type" ON "communication_media"("mediaType");

-- CreateIndex
CREATE INDEX "idx_inspections_location" ON "inspections"("locationId");

-- CreateIndex
CREATE INDEX "idx_inspections_date" ON "inspections"("inspectionDate");

-- CreateIndex
CREATE INDEX "idx_inspections_inspector" ON "inspections"("inspectorId");

-- CreateIndex
CREATE INDEX "idx_findings_inspection" ON "inspection_findings"("inspectionId");

-- CreateIndex
CREATE INDEX "idx_findings_asset" ON "inspection_findings"("assetId");

-- CreateIndex
CREATE INDEX "idx_findings_status" ON "inspection_findings"("status");

-- CreateIndex
CREATE INDEX "idx_photos_finding" ON "inspection_photos"("findingId");

-- CreateIndex
CREATE INDEX "idx_photos_asset" ON "inspection_photos"("assetId");

-- CreateIndex
CREATE INDEX "idx_har_reports_location" ON "har_reports"("locationId");

-- CreateIndex
CREATE INDEX "idx_har_reports_date" ON "har_reports"("reportDate");

-- CreateIndex
CREATE INDEX "idx_har_details_report" ON "har_details"("harReportId");

-- CreateIndex
CREATE INDEX "idx_har_details_asset" ON "har_details"("assetId");

-- CreateIndex
CREATE INDEX "idx_har_details_status" ON "har_details"("status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_har_detail_report_asset" ON "har_details"("harReportId", "assetId");

-- CreateIndex
CREATE INDEX "idx_documents_location" ON "documents"("locationId");

-- CreateIndex
CREATE INDEX "idx_documents_asset" ON "documents"("assetId");

-- CreateIndex
CREATE INDEX "idx_documents_type" ON "documents"("documentType");

-- CreateIndex
CREATE INDEX "idx_generated_reports_location" ON "generated_reports"("locationId");

-- CreateIndex
CREATE INDEX "idx_generated_reports_type" ON "generated_reports"("reportType");

-- CreateIndex
CREATE INDEX "idx_generated_reports_source" ON "generated_reports"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "idx_generated_reports_format" ON "generated_reports"("format");

-- CreateIndex
CREATE UNIQUE INDEX "report_signatures_reportId_key" ON "report_signatures"("reportId");

-- CreateIndex
CREATE INDEX "idx_report_signatures_number" ON "report_signatures"("reportNumber");

-- CreateIndex
CREATE INDEX "idx_report_signatures_source" ON "report_signatures"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "idx_report_signatures_status" ON "report_signatures"("status");

-- CreateIndex
CREATE INDEX "idx_report_downloads_report" ON "report_downloads"("reportId");

-- CreateIndex
CREATE INDEX "idx_report_downloads_at" ON "report_downloads"("downloadedAt");

-- CreateIndex
CREATE INDEX "idx_import_jobs_status" ON "import_jobs"("status");

-- CreateIndex
CREATE INDEX "idx_import_jobs_creator" ON "import_jobs"("createdBy");

-- CreateIndex
CREATE INDEX "idx_import_errors_job" ON "import_errors"("importJobId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_organization_code" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "idx_organizations_code" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "idx_up3s_rtupp" ON "up3s"("rtuppId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_up3_rtupp_code" ON "up3s"("rtuppId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_role_name" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_asset_category_name" ON "asset_categories"("name");

-- CreateIndex
CREATE INDEX "idx_asset_types_category" ON "asset_types"("assetCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_asset_type_category_name" ON "asset_types"("assetCategoryId", "name");

-- CreateIndex
CREATE INDEX "idx_performance_location" ON "performance_daily"("locationId");

-- CreateIndex
CREATE INDEX "idx_performance_date" ON "performance_daily"("performanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "uq_performance_location_date" ON "performance_daily"("locationId", "performanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "uq_ticket_number" ON "tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "idx_tickets_location" ON "tickets"("locationId");

-- CreateIndex
CREATE INDEX "idx_tickets_status" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "idx_tickets_priority" ON "tickets"("priority");

-- CreateIndex
CREATE INDEX "idx_tickets_assignee" ON "tickets"("assignedTo");

-- CreateIndex
CREATE INDEX "idx_tickets_created" ON "tickets"("createdAt");

-- CreateIndex
CREATE INDEX "idx_audit_logs_entity_type" ON "audit_logs"("entityType");

-- CreateIndex
CREATE INDEX "idx_audit_logs_entity_id" ON "audit_logs"("entityId");

-- CreateIndex
CREATE INDEX "idx_audit_logs_performer" ON "audit_logs"("performedBy");

-- CreateIndex
CREATE INDEX "idx_audit_logs_performed_at" ON "audit_logs"("performedAt");

-- CreateIndex
CREATE INDEX "idx_site_geometries_location" ON "site_geometries"("locationId");

-- CreateIndex
CREATE INDEX "idx_workflow_entity_type" ON "workflow_instances"("entityType");

-- CreateIndex
CREATE INDEX "idx_workflow_state" ON "workflow_instances"("currentState");

-- CreateIndex
CREATE UNIQUE INDEX "uq_workflow_entity" ON "workflow_instances"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "idx_workflow_tx_instance" ON "workflow_transitions"("instanceId");

-- CreateIndex
CREATE INDEX "idx_workflow_tx_entity" ON "workflow_transitions"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "idx_workflow_tx_performer" ON "workflow_transitions"("performedBy");

-- CreateIndex
CREATE INDEX "idx_workflow_tx_performed_at" ON "workflow_transitions"("performedAt");

-- CreateIndex
CREATE INDEX "idx_notification_user" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "idx_notification_user_read" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "idx_notification_created" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "idx_notification_user_created" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "uq_notification_dedupe" ON "notifications"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "idx_notification_delivery_due" ON "notification_deliveries"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "idx_notification_delivery_notification" ON "notification_deliveries"("notificationId");

-- CreateIndex
CREATE INDEX "idx_idempotency_created" ON "idempotency_keys"("createdAt");

-- CreateIndex
CREATE INDEX "idx_scada_gardu_type" ON "scada_gardu"("garduType");

-- CreateIndex
CREATE INDEX "idx_scada_gardu_status" ON "scada_gardu"("currentStatus");

-- CreateIndex
CREATE INDEX "idx_scada_gardu_type_status" ON "scada_gardu"("garduType", "currentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "uq_scada_gardu_type_code" ON "scada_gardu"("garduType", "code");

-- CreateIndex
CREATE INDEX "idx_inspeksi_gardu_records_kode_gardu" ON "inspeksi_gardu_records"("kodeGardu");

-- CreateIndex
CREATE INDEX "idx_inspeksi_gardu_records_up3" ON "inspeksi_gardu_records"("up3");

-- CreateIndex
CREATE INDEX "idx_inspeksi_gardu_records_status_scada" ON "inspeksi_gardu_records"("statusScada");

-- CreateIndex
CREATE INDEX "idx_inspeksi_gardu_records_tanggal" ON "inspeksi_gardu_records"("tanggalPekerjaan");

-- CreateIndex
CREATE INDEX "idx_inspeksi_gardu_records_kesimpulan_rectifier" ON "inspeksi_gardu_records"("kesimpulanRectifier");

-- CreateIndex
CREATE INDEX "idx_inspeksi_gardu_records_kesimpulan_baterai" ON "inspeksi_gardu_records"("kesimpulanBaterai");

-- CreateIndex
CREATE INDEX "idx_inspeksi_gardu_records_kesimpulan_rtu" ON "inspeksi_gardu_records"("kesimpulanRtu");

-- CreateIndex
CREATE INDEX "idx_inspeksi_gardu_records_kesimpulan_media" ON "inspeksi_gardu_records"("kesimpulanMedia");

-- CreateIndex
CREATE INDEX "idx_inspeksi_gardu_records_location" ON "inspeksi_gardu_records"("locationId");

-- CreateIndex
CREATE INDEX "idx_har_gardu_records_kode_gardu" ON "har_gardu_records"("kodeGardu");

-- CreateIndex
CREATE INDEX "idx_har_gardu_records_up3" ON "har_gardu_records"("up3");

-- CreateIndex
CREATE INDEX "idx_har_gardu_records_sumber_file" ON "har_gardu_records"("sumberFile");

-- CreateIndex
CREATE INDEX "idx_har_gardu_records_tanggal" ON "har_gardu_records"("tanggalPekerjaan");

-- CreateIndex
CREATE INDEX "idx_har_gardu_records_kesimpulan_rectifier" ON "har_gardu_records"("kesimpulanRectifier");

-- CreateIndex
CREATE INDEX "idx_har_gardu_records_kesimpulan_baterai" ON "har_gardu_records"("kesimpulanBaterai");

-- CreateIndex
CREATE INDEX "idx_har_gardu_records_kesimpulan_rtu" ON "har_gardu_records"("kesimpulanRtu");

-- CreateIndex
CREATE INDEX "idx_har_gardu_records_kesimpulan_media" ON "har_gardu_records"("kesimpulanMedia");

-- CreateIndex
CREATE INDEX "idx_har_gardu_records_location" ON "har_gardu_records"("locationId");

-- CreateIndex
CREATE INDEX "idx_ai_conv_user" ON "ai_conversations"("userId");

-- CreateIndex
CREATE INDEX "idx_ai_conv_session" ON "ai_conversations"("sessionId");

-- CreateIndex
CREATE INDEX "idx_ai_conv_intent" ON "ai_conversations"("intent");

-- CreateIndex
CREATE INDEX "idx_ai_conv_created" ON "ai_conversations"("createdAt");

-- CreateIndex
CREATE INDEX "idx_ai_feedback_conv" ON "ai_feedback"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_ai_pref_user" ON "ai_user_preferences"("userId");

-- CreateIndex
CREATE INDEX "idx_ai_alias_concept" ON "ai_aliases"("concept");

-- CreateIndex
CREATE UNIQUE INDEX "uq_ai_alias_user_phrase" ON "ai_aliases"("userId", "phrase");

-- CreateIndex
CREATE UNIQUE INDEX "uq_ai_intent_id" ON "ai_intents"("intentId");

-- CreateIndex
CREATE INDEX "idx_bays_location" ON "bays"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_bay_location_code" ON "bays"("locationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_wo_number" ON "work_orders"("woNumber");

-- CreateIndex
CREATE INDEX "idx_wo_location" ON "work_orders"("locationId");

-- CreateIndex
CREATE INDEX "idx_wo_status" ON "work_orders"("status");

-- CreateIndex
CREATE INDEX "idx_wo_type" ON "work_orders"("type");

-- CreateIndex
CREATE INDEX "idx_wo_team" ON "work_orders"("teamId");

-- CreateIndex
CREATE INDEX "idx_wo_due" ON "work_orders"("dueDate");

-- CreateIndex
CREATE INDEX "idx_wo_status_created" ON "work_orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "idx_wo_attachment_wo" ON "work_order_attachments"("workOrderId");

-- CreateIndex
CREATE INDEX "idx_laporan_gi_location" ON "laporan_gi"("locationId");

-- CreateIndex
CREATE INDEX "idx_laporan_gi_feeder" ON "laporan_gi"("feederId");

-- CreateIndex
CREATE INDEX "idx_laporan_gi_wo" ON "laporan_gi"("workOrderId");

-- CreateIndex
CREATE INDEX "idx_laporan_gi_status" ON "laporan_gi"("status");

-- CreateIndex
CREATE INDEX "idx_laporan_gi_status_created" ON "laporan_gi"("status", "createdAt");

-- CreateIndex
CREATE INDEX "idx_laporan_gi_date" ON "laporan_gi"("reportDate");

-- CreateIndex
CREATE INDEX "idx_laporan_har_gi_location" ON "laporan_har_gi"("locationId");

-- CreateIndex
CREATE INDEX "idx_laporan_har_gi_feeder" ON "laporan_har_gi"("feederId");

-- CreateIndex
CREATE INDEX "idx_laporan_har_gi_wo" ON "laporan_har_gi"("workOrderId");

-- CreateIndex
CREATE INDEX "idx_laporan_har_gi_status" ON "laporan_har_gi"("status");

-- CreateIndex
CREATE INDEX "idx_laporan_har_gi_status_created" ON "laporan_har_gi"("status", "createdAt");

-- CreateIndex
CREATE INDEX "idx_laporan_har_gi_date" ON "laporan_har_gi"("reportDate");

-- CreateIndex
CREATE INDEX "idx_laporan_gi_attachments_laporan_gi" ON "laporan_gi_attachments"("laporanGiId");

-- CreateIndex
CREATE INDEX "idx_laporan_gi_attachments_laporan_gi_category" ON "laporan_gi_attachments"("laporanGiId", "category");

-- CreateIndex
CREATE INDEX "idx_laporan_gi_attachments_status" ON "laporan_gi_attachments"("status");

-- CreateIndex
CREATE INDEX "idx_laporan_inspeksi_gh_location" ON "laporan_inspeksi_gh"("locationId");

-- CreateIndex
CREATE INDEX "idx_laporan_inspeksi_gh_wo" ON "laporan_inspeksi_gh"("workOrderId");

-- CreateIndex
CREATE INDEX "idx_laporan_inspeksi_gh_status" ON "laporan_inspeksi_gh"("status");

-- CreateIndex
CREATE INDEX "idx_laporan_har_gh_location" ON "laporan_har_gh"("locationId");

-- CreateIndex
CREATE INDEX "idx_laporan_har_gh_wo" ON "laporan_har_gh"("workOrderId");

-- CreateIndex
CREATE INDEX "idx_laporan_har_gh_status" ON "laporan_har_gh"("status");

-- CreateIndex
CREATE INDEX "idx_laporan_inspeksi_gh_attachments_parent" ON "laporan_inspeksi_gh_attachments"("laporanInspeksiGhId");

-- CreateIndex
CREATE INDEX "idx_laporan_inspeksi_gh_attachments_parent_category" ON "laporan_inspeksi_gh_attachments"("laporanInspeksiGhId", "category");

-- CreateIndex
CREATE INDEX "idx_laporan_inspeksi_gh_attachments_status" ON "laporan_inspeksi_gh_attachments"("status");

-- CreateIndex
CREATE INDEX "idx_laporan_har_gh_attachments_parent" ON "laporan_har_gh_attachments"("laporanHarGhId");

-- CreateIndex
CREATE INDEX "idx_laporan_har_gh_attachments_parent_category" ON "laporan_har_gh_attachments"("laporanHarGhId", "category");

-- CreateIndex
CREATE INDEX "idx_laporan_har_gh_attachments_status" ON "laporan_har_gh_attachments"("status");

-- CreateIndex
CREATE INDEX "idx_laporan_inspeksi_mp_location" ON "laporan_inspeksi_mp"("locationId");

-- CreateIndex
CREATE INDEX "idx_laporan_inspeksi_mp_wo" ON "laporan_inspeksi_mp"("workOrderId");

-- CreateIndex
CREATE INDEX "idx_laporan_inspeksi_mp_status" ON "laporan_inspeksi_mp"("status");

-- CreateIndex
CREATE INDEX "idx_laporan_har_mp_location" ON "laporan_har_mp"("locationId");

-- CreateIndex
CREATE INDEX "idx_laporan_har_mp_wo" ON "laporan_har_mp"("workOrderId");

-- CreateIndex
CREATE INDEX "idx_laporan_har_mp_status" ON "laporan_har_mp"("status");

-- CreateIndex
CREATE INDEX "idx_laporan_inspeksi_mp_attachments_parent" ON "laporan_inspeksi_mp_attachments"("laporanInspeksiMpId");

-- CreateIndex
CREATE INDEX "idx_laporan_inspeksi_mp_attachments_parent_category" ON "laporan_inspeksi_mp_attachments"("laporanInspeksiMpId", "category");

-- CreateIndex
CREATE INDEX "idx_laporan_inspeksi_mp_attachments_status" ON "laporan_inspeksi_mp_attachments"("status");

-- CreateIndex
CREATE INDEX "idx_laporan_har_mp_attachments_parent" ON "laporan_har_mp_attachments"("laporanHarMpId");

-- CreateIndex
CREATE INDEX "idx_laporan_har_mp_attachments_parent_category" ON "laporan_har_mp_attachments"("laporanHarMpId", "category");

-- CreateIndex
CREATE INDEX "idx_laporan_har_mp_attachments_status" ON "laporan_har_mp_attachments"("status");

-- CreateIndex
CREATE INDEX "idx_scada_snapshots_type_at" ON "scada_snapshots"("fileType", "uploadedAt");

-- CreateIndex
CREATE INDEX "idx_scada_snapshots_uploader" ON "scada_snapshots"("uploadedBy");

-- CreateIndex
CREATE INDEX "idx_scada_rtu_rows_snapshot" ON "scada_rtu_rows"("snapshotId");

-- CreateIndex
CREATE INDEX "idx_scada_rtu_rows_name" ON "scada_rtu_rows"("rtuName");

-- CreateIndex
CREATE INDEX "idx_scada_rtu_rows_oper_state" ON "scada_rtu_rows"("operState");

-- CreateIndex
CREATE INDEX "idx_scada_rtu_rows_location" ON "scada_rtu_rows"("locationId");

-- CreateIndex
CREATE INDEX "idx_scada_line_rows_snapshot" ON "scada_line_rows"("snapshotId");

-- CreateIndex
CREATE INDEX "idx_scada_line_rows_oper_state" ON "scada_line_rows"("operState");

-- CreateIndex
CREATE INDEX "idx_scada_line_rows_ifs_server" ON "scada_line_rows"("ifsServer");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_ibfk_1" FOREIGN KEY ("rtuppId") REFERENCES "rtupps"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_ibfk_2" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_fk" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_ibfk_1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_ibfk_1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rtupps" ADD CONSTRAINT "rtupps_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personil" ADD CONSTRAINT "personil_ibfk_1" FOREIGN KEY ("rtuppId") REFERENCES "rtupps"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_ibfk_1" FOREIGN KEY ("rtuppId") REFERENCES "rtupps"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_ibfk_2" FOREIGN KEY ("leaderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_awal" ADD CONSTRAINT "laporan_awal_ibfk_1" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_awal" ADD CONSTRAINT "laporan_awal_wo_fk" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_awal" ADD CONSTRAINT "laporan_awal_ibfk_2" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_awal" ADD CONSTRAINT "laporan_awal_ibfk_3" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_awal" ADD CONSTRAINT "laporan_awal_ibfk_4" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_akhir" ADD CONSTRAINT "laporan_akhir_ibfk_1" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_akhir" ADD CONSTRAINT "laporan_akhir_ibfk_2" FOREIGN KEY ("laporanAwalId") REFERENCES "laporan_awal"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_akhir" ADD CONSTRAINT "laporan_akhir_wo_fk" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_akhir" ADD CONSTRAINT "laporan_akhir_ibfk_3" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_akhir" ADD CONSTRAINT "laporan_akhir_ibfk_4" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_akhir" ADD CONSTRAINT "laporan_akhir_ibfk_5" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ibfk_1" FOREIGN KEY ("laporanAwalId") REFERENCES "laporan_awal"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ibfk_2" FOREIGN KEY ("laporanAkhirId") REFERENCES "laporan_akhir"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ibfk_4" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "report_validations" ADD CONSTRAINT "report_validations_ibfk_1" FOREIGN KEY ("laporanAwalId") REFERENCES "laporan_awal"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "report_validations" ADD CONSTRAINT "report_validations_ibfk_2" FOREIGN KEY ("laporanAkhirId") REFERENCES "laporan_akhir"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "report_validations" ADD CONSTRAINT "report_validations_ibfk_4" FOREIGN KEY ("validatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_ibfk_1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_ibfk_2" FOREIGN KEY ("laporanAwalId") REFERENCES "laporan_awal"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_ibfk_3" FOREIGN KEY ("laporanAkhirId") REFERENCES "laporan_akhir"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_supply_feeder_fk" FOREIGN KEY ("supplyFeederId") REFERENCES "feeders"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_rtupp_fk" FOREIGN KEY ("rtuppId") REFERENCES "rtupps"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "feeders" ADD CONSTRAINT "feeders_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "feeders" ADD CONSTRAINT "feeders_bay_fk" FOREIGN KEY ("bayId") REFERENCES "bays"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_feeder_fk" FOREIGN KEY ("feederId") REFERENCES "feeders"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_bay_fk" FOREIGN KEY ("bayId") REFERENCES "bays"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_parent_fk" FOREIGN KEY ("parentAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_type_fk" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "asset_sim_cards" ADD CONSTRAINT "sim_cards_asset_fk" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "communication_media" ADD CONSTRAINT "comm_media_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_fk" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inspection_findings" ADD CONSTRAINT "findings_inspection_fk" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inspection_findings" ADD CONSTRAINT "findings_asset_fk" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inspection_photos" ADD CONSTRAINT "photos_finding_fk" FOREIGN KEY ("findingId") REFERENCES "inspection_findings"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inspection_photos" ADD CONSTRAINT "photos_asset_fk" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "har_reports" ADD CONSTRAINT "har_reports_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "har_details" ADD CONSTRAINT "har_details_report_fk" FOREIGN KEY ("harReportId") REFERENCES "har_reports"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "har_details" ADD CONSTRAINT "har_details_asset_fk" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_asset_fk" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "report_signatures" ADD CONSTRAINT "report_signatures_report_fk" FOREIGN KEY ("reportId") REFERENCES "generated_reports"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "report_downloads" ADD CONSTRAINT "report_downloads_report_fk" FOREIGN KEY ("reportId") REFERENCES "generated_reports"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_job_fk" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "up3s" ADD CONSTRAINT "up3s_rtupp_fk" FOREIGN KEY ("rtuppId") REFERENCES "rtupps"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "asset_types" ADD CONSTRAINT "asset_types_category_fk" FOREIGN KEY ("assetCategoryId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "performance_daily" ADD CONSTRAINT "performance_daily_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_fk" FOREIGN KEY ("assignedTo") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_performer_fk" FOREIGN KEY ("performedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "site_geometries" ADD CONSTRAINT "site_geometries_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_instance_fk" FOREIGN KEY ("instanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_performer_fk" FOREIGN KEY ("performedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_fk" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_fk" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inspeksi_gardu_records" ADD CONSTRAINT "inspeksi_gardu_records_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "har_gardu_records" ADD CONSTRAINT "har_gardu_records_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_conv_fk" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "bays" ADD CONSTRAINT "bays_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_bay_fk" FOREIGN KEY ("bayId") REFERENCES "bays"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_feeder_fk" FOREIGN KEY ("feederId") REFERENCES "feeders"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_asset_fk" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_team_fk" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_fk" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_approved_by_fk" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_rejected_by_fk" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_scada_fk" FOREIGN KEY ("scadaGarduId") REFERENCES "scada_gardu"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_order_attachments" ADD CONSTRAINT "wo_attachments_wo_fk" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_gi" ADD CONSTRAINT "laporan_gi_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_gi" ADD CONSTRAINT "laporan_gi_feeder_fk" FOREIGN KEY ("feederId") REFERENCES "feeders"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_gi" ADD CONSTRAINT "laporan_gi_wo_fk" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_gi" ADD CONSTRAINT "laporan_gi_inspector_fk" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_har_gi" ADD CONSTRAINT "laporan_har_gi_wo_fk" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_har_gi" ADD CONSTRAINT "laporan_har_gi_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_har_gi" ADD CONSTRAINT "laporan_har_gi_feeder_fk" FOREIGN KEY ("feederId") REFERENCES "feeders"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_har_gi" ADD CONSTRAINT "laporan_har_gi_asset_fk" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_har_gi" ADD CONSTRAINT "laporan_har_gi_inspector_fk" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_gi_attachments" ADD CONSTRAINT "laporan_gi_attachments_laporan_gi_fk" FOREIGN KEY ("laporanGiId") REFERENCES "laporan_gi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laporan_inspeksi_gh" ADD CONSTRAINT "laporan_inspeksi_gh_wo_fk" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laporan_inspeksi_gh" ADD CONSTRAINT "laporan_inspeksi_gh_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_inspeksi_gh" ADD CONSTRAINT "laporan_inspeksi_gh_feeder_fk" FOREIGN KEY ("feederId") REFERENCES "feeders"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_inspeksi_gh" ADD CONSTRAINT "laporan_inspeksi_gh_inspector_fk" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_har_gh" ADD CONSTRAINT "laporan_har_gh_wo_fk" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laporan_har_gh" ADD CONSTRAINT "laporan_har_gh_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_har_gh" ADD CONSTRAINT "laporan_har_gh_feeder_fk" FOREIGN KEY ("feederId") REFERENCES "feeders"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_har_gh" ADD CONSTRAINT "laporan_har_gh_inspector_fk" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_inspeksi_gh_attachments" ADD CONSTRAINT "laporan_inspeksi_gh_attachments_parent_fk" FOREIGN KEY ("laporanInspeksiGhId") REFERENCES "laporan_inspeksi_gh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laporan_har_gh_attachments" ADD CONSTRAINT "laporan_har_gh_attachments_parent_fk" FOREIGN KEY ("laporanHarGhId") REFERENCES "laporan_har_gh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laporan_inspeksi_mp" ADD CONSTRAINT "laporan_inspeksi_mp_wo_fk" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laporan_inspeksi_mp" ADD CONSTRAINT "laporan_inspeksi_mp_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_inspeksi_mp" ADD CONSTRAINT "laporan_inspeksi_mp_feeder_fk" FOREIGN KEY ("feederId") REFERENCES "feeders"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_inspeksi_mp" ADD CONSTRAINT "laporan_inspeksi_mp_inspector_fk" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_har_mp" ADD CONSTRAINT "laporan_har_mp_wo_fk" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laporan_har_mp" ADD CONSTRAINT "laporan_har_mp_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_har_mp" ADD CONSTRAINT "laporan_har_mp_feeder_fk" FOREIGN KEY ("feederId") REFERENCES "feeders"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_har_mp" ADD CONSTRAINT "laporan_har_mp_inspector_fk" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "laporan_inspeksi_mp_attachments" ADD CONSTRAINT "laporan_inspeksi_mp_attachments_parent_fk" FOREIGN KEY ("laporanInspeksiMpId") REFERENCES "laporan_inspeksi_mp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laporan_har_mp_attachments" ADD CONSTRAINT "laporan_har_mp_attachments_parent_fk" FOREIGN KEY ("laporanHarMpId") REFERENCES "laporan_har_mp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scada_snapshots" ADD CONSTRAINT "scada_snapshots_uploader_fk" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scada_rtu_rows" ADD CONSTRAINT "scada_rtu_rows_snapshot_fk" FOREIGN KEY ("snapshotId") REFERENCES "scada_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scada_rtu_rows" ADD CONSTRAINT "scada_rtu_rows_location_fk" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scada_line_rows" ADD CONSTRAINT "scada_line_rows_snapshot_fk" FOREIGN KEY ("snapshotId") REFERENCES "scada_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

