/**
 * Sentry initialisation for the frontend.
 *
 * Disabled automatically when VITE_SENTRY_DSN is empty — the app runs normally
 * without it. Captures:
 *   - React render crashes (via ErrorBoundary.componentDidCatch -> captureError)
 *   - API errors (axios response interceptor -> captureError)
 *   - Route errors (errors thrown in route components bubble to ErrorBoundary)
 *   - Uncaught errors / unhandled promise rejections (browser globals, automatic)
 */
import * as Sentry from "@sentry/react";
import { APP_VERSION } from "@/lib/appVersion";

let enabled = false;

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    if (import.meta.env.DEV) {
      console.log("[SENTRY] VITE_SENTRY_DSN not set — frontend monitoring disabled.");
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string) || import.meta.env.MODE,
    release:
      (import.meta.env.VITE_SENTRY_RELEASE as string) || `voltreport-frontend@${APP_VERSION}`,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: parseFloat((import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE as string) || "0"),
    // Don't capture PII (request bodies, etc.) unless explicitly enabled.
    sendDefaultPii: false,
  });

  enabled = true;
}

export function isSentryEnabled(): boolean {
  return enabled;
}

/** Attach the logged-in user to the Sentry scope (call after login). */
export function setSentryUser(user: { id: string; email?: string; role?: string } | null): void {
  if (!enabled) return;
  Sentry.setUser(user ? { id: user.id, email: user.email, role: user.role } : null);
}

/** Manually report an error with optional context. No-op when disabled. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export { Sentry };
