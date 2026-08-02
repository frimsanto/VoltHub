import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';

/**
 * Company branding for the Enterprise Report Generator.
 *
 * Single source of truth for the letterhead applied to every generated PDF /
 * Excel artifact. Values are env-driven (see config/env.ts) so a deployment can
 * re-brand reports without a code change. The logo is resolved lazily and
 * cached: a missing/invalid logo silently degrades to the text wordmark.
 */
export interface Branding {
  appName: string;
  companyName: string;
  companyUnit: string;
  companyAddress: string;
  footerNote: string;
  /** Absolute path to a readable logo image, or null when none is configured. */
  logoPath: string | null;
}

const APP_NAME = 'VoltHub';

function resolveLogoPath(): string | null {
  const raw = env.REPORT_COMPANY_LOGO?.trim();
  if (!raw) return null;
  const abs = path.isAbsolute(raw) ? raw : path.join(process.cwd(), env.UPLOAD_DIR, raw);
  try {
    return fs.existsSync(abs) ? abs : null;
  } catch {
    return null;
  }
}

let cached: Branding | null = null;

export function getBranding(): Branding {
  if (cached) return cached;
  cached = {
    appName: APP_NAME,
    companyName: env.REPORT_COMPANY_NAME,
    companyUnit: env.REPORT_COMPANY_UNIT,
    companyAddress: env.REPORT_COMPANY_ADDRESS,
    footerNote: env.REPORT_FOOTER_NOTE,
    logoPath: resolveLogoPath(),
  };
  return cached;
}

/** Test/hot-reload helper — drops the memoised branding. */
export function resetBrandingCache(): void {
  cached = null;
}

/** Brand accent (PLN navy / electric blue) used for rules and headings. */
export const BRAND_COLOR = '#0B5394';
export const BRAND_COLOR_EXCEL = 'FF0B5394';
