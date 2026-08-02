import path from 'path';

/**
 * Defence-in-depth for file uploads.
 *
 * The multer fileFilter validates the declared MIME type, but a client controls
 * that header and the stored filename's extension comes from the original name.
 * To ensure a malicious file can never land on disk with an executable/script
 * extension (e.g. .php, .html, .svg, .exe), we whitelist the extensions we
 * actually accept and neutralise anything else to ".bin".
 */
const ALLOWED_EXTENSIONS = new Set([
  // images
  '.jpg', '.jpeg', '.png', '.webp',
  // videos
  '.mp4', '.mov', '.avi',
  // documents
  '.pdf', '.txt', '.log', '.xlsx',
]);

/**
 * MIME types that can carry executable markup/scripts and must never be accepted
 * by an upload filter, even when a broad rule (e.g. `image/*`) would let them
 * through. SVG is an image but renders <script>; XML/HTML are obvious vectors.
 * This is the upload-time half of the stored-XSS defence (the serving endpoints
 * also force a download + nosniff for anything non-raster).
 */
const DANGEROUS_UPLOAD_MIME = new Set([
  'image/svg+xml',
  'image/svg',
  'text/html',
  'application/xhtml+xml',
  'text/xml',
  'application/xml',
  'application/xhtml',
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
]);

/** True when the declared MIME type can carry executable markup/script. */
export const isDangerousUploadMime = (mimeType?: string | null): boolean =>
  !!mimeType && DANGEROUS_UPLOAD_MIME.has(mimeType.trim().toLowerCase());

/** Lower-cased, dot-prefixed extension if it's on the allowlist, else ".bin". */
export const safeUploadExt = (originalName: string): string => {
  const ext = path.extname(originalName).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) ? ext : '.bin';
};

/**
 * Produce a safe on-disk filename: sanitise the base name (alphanumerics + dot),
 * cap its length, append a unique suffix, and force a whitelisted extension.
 */
export const safeUploadFilename = (originalName: string): string => {
  const ext = safeUploadExt(originalName);
  const base = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 50) || 'file';
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${base}-${uniqueSuffix}${ext}`;
};
