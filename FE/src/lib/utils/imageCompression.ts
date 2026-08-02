// Client-side image compression.
//
// Field reports routinely attach dozens of full-resolution phone/WhatsApp
// photos (2–5 MB each). Uploading them raw is slow and can reset the
// connection. Re-encoding to a bounded resolution + JPEG quality shrinks each
// photo by ~5–10x with no visible loss for documentation purposes, which makes
// uploads dramatically faster and far more reliable.

export interface CompressOptions {
  /** Longest edge in pixels. Images larger than this are scaled down. */
  maxDimension?: number;
  /** JPEG quality 0–1. */
  quality?: number;
  /** Skip compression for files already smaller than this (bytes). */
  skipBelowBytes?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxDimension: 1920,
  quality: 0.7,
  skipBelowBytes: 300 * 1024, // 300 KB — already small enough, not worth re-encoding
};

// Only raster image types benefit from canvas re-encoding. PDFs, XLSX loggers,
// and videos are passed through untouched.
const COMPRESSIBLE = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

function isCompressible(file: File): boolean {
  return COMPRESSIBLE.includes(file.type);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap is the fast path; fall back to <img> where unsupported.
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image"));
    };
    img.src = url;
  });
}

/**
 * Compress a single image. Returns the original file unchanged when it is not a
 * raster image, is already small, or if anything goes wrong (compression must
 * never block a valid upload).
 */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxDimension, quality, skipBelowBytes } = { ...DEFAULTS, ...opts };

  if (!isCompressible(file) || file.size <= skipBelowBytes) {
    return file;
  }

  try {
    const bitmap = await loadBitmap(file);
    const srcW = (bitmap as ImageBitmap).width || (bitmap as HTMLImageElement).naturalWidth;
    const srcH = (bitmap as ImageBitmap).height || (bitmap as HTMLImageElement).naturalHeight;

    const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );

    // Keep whichever is smaller — re-encoding can occasionally grow a file.
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Compress many images with bounded concurrency. */
export async function compressImages(
  files: File[],
  opts: CompressOptions = {},
  concurrency = 4,
): Promise<File[]> {
  const result: File[] = new Array(files.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < files.length) {
      const i = next++;
      result[i] = await compressImage(files[i], opts);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return result;
}
