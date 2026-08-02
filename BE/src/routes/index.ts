import { Router, Request, Response } from 'express';
import authRoutes from './authRoutes';
import dashboardRoutes from './dashboardRoutes';
import laporanAwalRoutes from './laporanAwalRoutes';
import laporanAkhirRoutes from './laporanAkhirRoutes';
import historyRoutes from './historyRoutes';
import uploadRoutes from './uploadRoutes';
import exportRoutes from './exportRoutes';
import userRoutes from './userRoutes';
import rekapRoutes from './rekapRoutes';
import rekapAkhirRoutes from './rekapAkhirRoutes';
import teamRoutes from './teamRoutes';
import rtuppRoutes from './rtuppRoutes';
import personilRoutes from './personilRoutes';
import auditRoutes from './auditRoutes';
import pushRoutes from './pushRoutes';
import locationRoutes from '../modules/locations/location.routes';
import feederRoutes from '../modules/feeders/feeder.routes';
import assetRoutes from '../modules/assets/asset.routes';
import simCardRoutes from '../modules/asset-sim-cards/asset-sim-card.routes';
import communicationMediaRoutes from '../modules/communication-media/communication-media.routes';
import inspectionRoutes, { findingsRouter } from '../modules/inspections/inspection.routes';
import harRoutes from '../modules/har/har.routes';
import documentRoutes from '../modules/documents/document.routes';
import reportRoutes from '../modules/reports/report.routes';
import verifyRoutes from '../modules/reports/signature.routes';
import importRoutes from '../modules/imports/import.routes';
import aiRoutes from '../modules/ai/ai.routes';
import organizationRoutes from '../modules/organizations/organization.routes';
import up3Routes from '../modules/up3s/up3.routes';
import assetCategoryRoutes from '../modules/asset-categories/asset-category.routes';
import assetTypeRoutes from '../modules/asset-types/asset-type.routes';
import performanceRoutes from '../modules/performance/performance.routes';
import ticketRoutes from '../modules/tickets/ticket.routes';
import workOrderRoutes from '../modules/work-orders/work-order.routes';
import bayRoutes from '../modules/bays/bay.routes';
import auditLogRoutes from '../modules/audit-logs/audit-log.routes';
import workflowRoutes from '../modules/workflow/workflow.routes';
import notificationRoutes from '../modules/notifications/notification.routes';
import kpiRoutes from '../modules/kpi/kpi.routes';
import dashboardV2Routes from '../modules/dashboard/dashboard.routes';
import gisRoutes from '../modules/gis/gis.routes';
import scadaRealtimeRoutes from '../modules/scada-realtime/scada-realtime.routes';
import scadaUploadRoutes from '../modules/scada-upload/scada-upload.routes';
import publicStatsRoutes from '../modules/stats/public-stats.routes';
import giDashboardRoutes from '../modules/gi-dashboard/gi-dashboard.routes';
import laporanGiRoutes from '../modules/laporan-gi/laporan-gi.routes';
import laporanHarGiRoutes from '../modules/laporan-har-gi/laporan-har-gi.routes';
import laporanInspeksiGhRoutes from '../modules/laporan-inspeksi-gh/laporan-inspeksi-gh.routes';
import laporanHarGhRoutes from '../modules/laporan-har-gh/laporan-har-gh.routes';
import laporanInspeksiMpRoutes from '../modules/laporan-inspeksi-mp/laporan-inspeksi-mp.routes';
import laporanHarMpRoutes from '../modules/laporan-har-mp/laporan-har-mp.routes';
import { env } from '../config/env';
import { versionGate } from '../middlewares/versionGate';

const router = Router();

// Health check endpoint (accessible via /api/health)
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'VoltHub Backend is running',
    data: {
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'VoltHub API'
    }
  });
});

// App version info for the force-update gate (public, no auth, no gate).
router.get('/version', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'OK',
    data: {
      minVersion: env.APP_MIN_VERSION,
      latestVersion: env.APP_LATEST_VERSION,
      updateUrl: {
        android: env.APP_UPDATE_URL_ANDROID,
        ios: env.APP_UPDATE_URL_IOS,
      },
    },
  });
});

// Reject outdated native clients on every other route.
router.use(versionGate);

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/laporan-awal', laporanAwalRoutes);
router.use('/laporan-akhir', laporanAkhirRoutes);
router.use('/history', historyRoutes);
router.use('/upload', uploadRoutes);
router.use('/export', exportRoutes);
router.use('/users', userRoutes);
router.use('/rekap', rekapRoutes);
router.use('/rekap-akhir', rekapAkhirRoutes);
router.use('/teams', teamRoutes);
router.use('/rtupp', rtuppRoutes);
router.use('/personil', personilRoutes);
router.use('/audit', auditRoutes);
router.use('/push', pushRoutes);

// ── VoltHub V2 — Asset Management domain (TDD base path: /api/v1) ──
const v1 = Router();
// ── Gardu-centric foundation & master data (Phase 2) ──
v1.use('/organizations', organizationRoutes);
v1.use('/up3s', up3Routes);
v1.use('/asset-categories', assetCategoryRoutes);
v1.use('/asset-types', assetTypeRoutes);
// ── Asset Management domain (Sprint 1) ──
v1.use('/locations', locationRoutes);
v1.use('/feeders', feederRoutes);
v1.use('/assets', assetRoutes);
v1.use('/sim-cards', simCardRoutes);
v1.use('/communication-media', communicationMediaRoutes);
// ── Operations & service ──
v1.use('/inspections', inspectionRoutes);
v1.use('/findings', findingsRouter);
v1.use('/har-reports', harRoutes);
v1.use('/performance', performanceRoutes);
v1.use('/tickets', ticketRoutes);
// ── Operation Management System GI RTUPP1 (Work Order domain) ──
v1.use('/bays', bayRoutes);
v1.use('/work-orders', workOrderRoutes);
// ── Documents, reports, import engine, audit, AI ──
v1.use('/documents', documentRoutes);
v1.use('/reports', reportRoutes);
// Public report verification (Digital Signature) — NO auth (QR scans must work
// for anyone). Mounted before reportRoutes' authenticated surface is irrelevant
// here as it is a distinct base path.
v1.use('/verify', verifyRoutes);
// Public operational aggregates for the anonymous login page — NO auth.
// Whitelisted, cached counts only (no row-level/PII). See stats module.
v1.use('/stats', publicStatsRoutes);
v1.use('/imports', importRoutes);
v1.use('/audit-logs', auditLogRoutes);
v1.use('/workflow', workflowRoutes);
v1.use('/notifications', notificationRoutes);
v1.use('/kpi', kpiRoutes);
v1.use('/dashboard', dashboardV2Routes);
v1.use('/gi/dashboard', giDashboardRoutes);
v1.use('/gi/inspeksi', laporanGiRoutes);
v1.use('/gi/har', laporanHarGiRoutes);
v1.use('/gh/inspeksi', laporanInspeksiGhRoutes);
v1.use('/gh/har', laporanHarGhRoutes);
v1.use('/mp/inspeksi', laporanInspeksiMpRoutes);
v1.use('/mp/har', laporanHarMpRoutes);
v1.use('/gis', gisRoutes);
// Real-time INS/OOP dashboard (Laporan Gardu RC/GH/GI availability)
v1.use('/scada-realtime', scadaRealtimeRoutes);
// SCADA snapshot dari export harian Siemens SP7 (upload NOC + dashboard reads)
v1.use('/scada', scadaUploadRoutes);
v1.use('/ai', aiRoutes);
router.use('/v1', v1);

export default router;
