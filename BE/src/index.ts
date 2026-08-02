// Sentry must be initialised before express is imported so its
// auto-instrumentation can patch the HTTP layer. initSentry() is a no-op when
// SENTRY_DSN is empty.
import { initSentry, Sentry } from './config/sentry';
initSentry();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { env, validateProductionEnv } from './config/env';
import routes from './routes';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './config/swagger';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { requestLogger } from './middlewares/logger';
import { auditContext } from './middlewares/auditContext';
import { sentryUserContext } from './middlewares/sentryUser';
import { apiLimiter } from './middlewares/rateLimit';
import { notificationQueue } from './modules/notifications/notification.queue';
import { videoCompressorQueue } from './modules/laporan-gi/video-compressor.worker';

// Refuse to boot production with insecure config (weak JWT secrets, etc.).
validateProductionEnv();

// Ensure upload directories exist
const uploadDir = path.join(process.cwd(), env.UPLOAD_DIR);
const subdirs = ['laporan-awal', 'laporan-akhir', 'temp', 'avatars', 'images', 'documents'];

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`[INIT] Created upload directory: ${uploadDir}`);
}

subdirs.forEach(subdir => {
  const dirPath = path.join(uploadDir, subdir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`[INIT] Created subdirectory: ${dirPath}`);
  }
});

const app = express();

// Middleware
app.use(helmet());
// Allowed browser origins. Besides the configured web origin (CORS_ORIGIN, may be
// comma-separated), we permit the Capacitor app origins and local/LAN web origins
// so the Android/iOS build and same-WiFi devices can reach the API during rollout.
// Credentials stay on and we never use '*', so each request echoes its own origin.
const staticAllowedOrigins = new Set<string>([
  ...env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  'https://localhost', // Capacitor Android (androidScheme: https)
  'capacitor://localhost', // Capacitor iOS / native scheme
  'http://localhost', // Capacitor fallback
]);
const lanOriginRe =
  /^https?:\/\/(localhost|127\.0\.0\.1|(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3})(?::\d+)?$/;
app.use(cors({
  origin: (origin, cb) => {
    // No Origin header → native/non-browser client (e.g. Capacitor HTTP, curl).
    if (!origin || staticAllowedOrigins.has(origin) || lanOriginRe.test(origin)) {
      return cb(null, true);
    }
    cb(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(requestLogger);
// Capture ipAddress/userAgent per request for the audit trail (AsyncLocalStorage).
app.use(auditContext);
// Tag Sentry events with the authenticated user (no-op when Sentry disabled).
app.use(sentryUserContext);

// Avatars: served INLINE so they render in <img>. Safe because uploadAvatar only
// accepts raster images (jpeg/png/webp — never SVG), and nosniff prevents MIME
// confusion. This more-specific mount MUST come before the general /uploads
// handler below (which forces an attachment disposition).
app.use(
  '/uploads/avatars',
  express.static(path.join(process.cwd(), env.UPLOAD_DIR, 'avatars'), {
    setHeaders: (res) => {
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // The app (web :5173, Capacitor capacitor://localhost / https://localhost,
      // or the prod web origin) loads avatars from THIS API origin — a different
      // origin. Helmet's default Cross-Origin-Resource-Policy: same-origin would
      // make the browser block the <img>, so the avatar silently fell back to
      // initials on every platform. Override to cross-origin for these images
      // only (safe: raster-only uploads + nosniff).
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

// Static files. Force a download disposition and disable content sniffing so an
// uploaded file can never be rendered/executed inline in the browser (defence
// against stored-XSS via SVG/HTML and clickjacking through user content).
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), env.UPLOAD_DIR), {
    setHeaders: (res) => {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  })
);

// Trust the first proxy hop so express-rate-limit sees the real client IP
// behind Nginx/load balancer (otherwise everyone shares the proxy's IP).
app.set('trust proxy', 1);

// API documentation (Swagger UI + raw OpenAPI JSON). Mounted before the rate
// limiter so the docs UI assets are never throttled. Public, no auth.
app.get(`${env.API_PREFIX}/docs.json`, (_req, res) => res.json(openApiSpec));
app.use(`${env.API_PREFIX}/docs`, swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customSiteTitle: 'VoltHub V2 API Docs',
}));

// Broad API rate limit (brute-force / abuse protection). Auth-specific limits
// are applied on the auth routes themselves.
app.use(env.API_PREFIX, apiLimiter);

// Health check (root level)
app.get('/health', (_req, res) => {
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

// API routes
app.use(env.API_PREFIX, routes);

// 404 handler
app.use(notFoundHandler);

// Sentry Express error handler — must run AFTER routes and BEFORE our own
// error handler so every unhandled express error is forwarded to Sentry.
// No-op when Sentry is disabled.
Sentry.setupExpressErrorHandler(app);

// Error handler (final formatter for the client response)
app.use(errorHandler);

// Start server
const PORT = env.PORT;

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║           VoltHub Backend Server                       ║
╠════════════════════════════════════════════════════════╣
║  Environment: ${env.NODE_ENV.padEnd(35)}║
║  Port:       ${PORT.toString().padEnd(35)}║
║  API:        ${(env.API_PREFIX).padEnd(35)}║
╚════════════════════════════════════════════════════════╝
  `);

  // Drain the notification delivery queue (push retries) in-process.
  notificationQueue.start();
  // Resume video compression worker tasks that are pending/stuck
  videoCompressorQueue.resumePending();
});

// Stop the queue worker on graceful shutdown so timers don't dangle.
const shutdown = (signal: string) => {
  console.log(`[shutdown] ${signal} received — stopping notification queue`);
  notificationQueue.stop();
  server.close(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
