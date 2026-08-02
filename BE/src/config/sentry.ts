/**
 * Sentry initialisation for the backend.
 *
 * IMPORTANT: this module must be imported BEFORE express and the rest of the
 * app (see src/index.ts) so Sentry's auto-instrumentation can patch the HTTP
 * layer. When SENTRY_DSN is empty, init is skipped and every export becomes a
 * no-op — the app behaves exactly as before, so this is safe in dev/CI.
 *
 * On init, Sentry automatically captures:
 *   - uncaught exceptions  (process 'uncaughtException')
 *   - unhandled rejections (process 'unhandledRejection')
 * Express request errors are forwarded via setupSentryErrorHandler(app).
 */
import * as Sentry from '@sentry/node';
import { env } from './env';

let enabled = false;

export const initSentry = (): void => {
  if (!env.SENTRY_DSN) {
    console.log('[SENTRY] DSN not set — error monitoring disabled.');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    release: env.SENTRY_RELEASE,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    // Don't leak request bodies / headers that may contain tokens by default.
    sendDefaultPii: false,
  });

  enabled = true;
  console.log(
    `[SENTRY] Initialised (env=${env.SENTRY_ENVIRONMENT}, release=${env.SENTRY_RELEASE})`
  );
};

export const isSentryEnabled = (): boolean => enabled;

/** Manually report an error with optional context. No-op when disabled. */
export const captureException = (
  error: unknown,
  context?: Record<string, unknown>
): void => {
  if (!enabled) return;
  if (context) {
    Sentry.captureException(error, { extra: context });
  } else {
    Sentry.captureException(error);
  }
};

export { Sentry };
