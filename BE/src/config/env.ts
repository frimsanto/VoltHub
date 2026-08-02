import dotenv from 'dotenv';

dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001', 10),
  API_PREFIX: process.env.API_PREFIX || '/api',
  
  DATABASE_URL: process.env.DATABASE_URL || '',
  
  JWT_SECRET: process.env.JWT_SECRET || 'default-secret-change-in-production',
  // Short-lived access token: a stolen access token is only usable for ~1h.
  // The client transparently rotates it via /auth/refresh on a 401 (see the
  // axios response interceptor), so the shorter window is invisible to users
  // while the long-lived (revocable, rotated) refresh token preserves sessions.
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1h',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '26214400', 10),
  MAX_FILES_PER_UPLOAD: parseInt(process.env.MAX_FILES_PER_UPLOAD || '20', 10),
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  // Per-user (or per-IP) budget over the window. An authenticated SPA legitimately
  // fans out many reads per page; 100 was unrealistically low and throttled normal
  // use. 1000/15min still caps abuse while keeping real dashboards responsive.
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
  
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // App version gate (force-update). Bump APP_MIN_VERSION to lock out old
  // native clients whose payloads would corrupt data after a breaking change.
  APP_MIN_VERSION: process.env.APP_MIN_VERSION || '1.0.0',
  APP_LATEST_VERSION: process.env.APP_LATEST_VERSION || '1.0.0',
  APP_UPDATE_URL_ANDROID:
    process.env.APP_UPDATE_URL_ANDROID || 'https://play.google.com/store/apps/details?id=id.pln.voltreport',
  APP_UPDATE_URL_IOS:
    process.env.APP_UPDATE_URL_IOS || 'https://apps.apple.com/app/voltreport',

  // Firebase Cloud Messaging (push). Leave empty to disable push sending.
  FCM_SERVER_KEY: process.env.FCM_SERVER_KEY || '',

  // AI (Claude). ANTHROPIC_API_KEY powers the legacy /ai/chat assistant AND the
  // FAB assistant's model backend (POST /api/v1/ai/groq-proxy → Anthropic
  // Messages API, claude-haiku-4-5). The key lives ONLY here (BE): the browser
  // never calls Anthropic directly, so the secret is never shipped in the
  // client bundle. Empty ⇒ the proxy returns 503 and the FAB shows its honest
  // preview mode; /ai/chat falls back to the deterministic engine.
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || 'claude-opus-4-8',

  // Company branding for generated reports (Enterprise Report Generator).
  // Override per-deployment to re-brand PDFs/Excel without code changes.
  REPORT_COMPANY_NAME: process.env.REPORT_COMPANY_NAME || 'PT PLN (Persero)',
  REPORT_COMPANY_UNIT: process.env.REPORT_COMPANY_UNIT || 'Unit Pelaksana Pengatur Distribusi',
  REPORT_COMPANY_ADDRESS:
    process.env.REPORT_COMPANY_ADDRESS || 'Jl. Trunojoyo Blok M-I No. 135, Jakarta Selatan',
  // Absolute or UPLOAD_DIR-relative path to a PNG/JPG logo. Empty = text mark only.
  REPORT_COMPANY_LOGO: process.env.REPORT_COMPANY_LOGO || '',
  REPORT_FOOTER_NOTE:
    process.env.REPORT_FOOTER_NOTE || 'Dokumen ini dibuat secara otomatis oleh sistem VoltHub.',

  // Digital Signature module (Ed25519, offline-verifiable QR on every report).
  // Production: provide a fixed keypair (PEM; literal "\n" escapes accepted) so
  // tokens stay verifiable across deploys. If unset, a keypair is generated once
  // and persisted under <UPLOAD_DIR>/keys/ (dev/self-hosted convenience).
  SIGNATURE_PRIVATE_KEY: process.env.SIGNATURE_PRIVATE_KEY || '',
  SIGNATURE_PUBLIC_KEY: process.env.SIGNATURE_PUBLIC_KEY || '',
  // Base URL of the public verification page (where the QR points). Falls back
  // to CORS_ORIGIN (the web app origin).
  SIGNATURE_VERIFY_BASE_URL: process.env.SIGNATURE_VERIFY_BASE_URL || '',

  // Sentry error monitoring. Leave SENTRY_DSN empty to disable Sentry entirely
  // (the app runs normally without it — safe default for local/dev).
  SENTRY_DSN: process.env.SENTRY_DSN || '',
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  // Release version for source-map/grouping. Defaults to the app version.
  SENTRY_RELEASE:
    process.env.SENTRY_RELEASE ||
    `voltreport-backend@${process.env.npm_package_version || '1.0.0'}`,
  // Fraction of transactions traced for performance (0 disables tracing).
  SENTRY_TRACES_SAMPLE_RATE: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0'),
};

/**
 * Fail fast on insecure configuration in production.
 *
 * The JWT secrets fall back to well-known hardcoded defaults for local/dev
 * convenience. Booting production with those defaults would let anyone forge
 * valid tokens, so we refuse to start. Also enforces a minimum secret length
 * and forbids a wildcard CORS origin together with credentialed requests.
 */
const INSECURE_DEFAULTS = new Set([
  'default-secret-change-in-production',
  'default-refresh-secret',
]);

export const validateProductionEnv = (): void => {
  if (env.NODE_ENV !== 'production') return;

  const errors: string[] = [];

  if (INSECURE_DEFAULTS.has(env.JWT_SECRET) || env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be set to a strong value (>= 32 chars) in production.');
  }
  if (
    INSECURE_DEFAULTS.has(env.JWT_REFRESH_SECRET) ||
    env.JWT_REFRESH_SECRET.length < 32
  ) {
    errors.push('JWT_REFRESH_SECRET must be set to a strong value (>= 32 chars) in production.');
  }
  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET must differ.');
  }
  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL must be set in production.');
  }
  if (env.CORS_ORIGIN === '*') {
    errors.push('CORS_ORIGIN must not be "*" with credentialed requests.');
  }

  if (errors.length) {
    throw new Error(
      `[ENV] Insecure production configuration:\n  - ${errors.join('\n  - ')}`
    );
  }
};

export default env;
