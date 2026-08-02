// Client-side video compression via ffmpeg.wasm.
//
// Field reports attach phone-recorded clips that are routinely 30–150 MB. Those
// raw uploads are slow and frequently reset on field connections. We transcode
// to H.264 (CRF 28, capped at 720p) which typically shrinks a clip 3–5x with
// acceptable documentation quality.
//
// Caveats this module is built around:
//  - The single-threaded core is used on purpose: it does NOT need
//    SharedArrayBuffer / cross-origin isolation (COOP+COEP), so wiring it in
//    can't break the rest of the app (external images, Sentry, etc.).
//  - ffmpeg is heavy (~30 MB core) and slow on phones, so it is lazy-loaded the
//    first time a video actually needs compressing, and clips are processed
//    strictly one at a time.
//  - Compression must never block a valid upload: any failure returns the
//    original file untouched.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export interface VideoCompressOptions {
  /** Longest edge in pixels. Larger videos are scaled down (keeps aspect). */
  maxDimension?: number;
  /** x264 Constant Rate Factor (lower = better quality/bigger). 18–32 sane. */
  crf?: number;
  /** Skip compression for files already smaller than this (bytes). */
  skipBelowBytes?: number;
  /** Per-file progress 0–1 (transcode ratio). */
  onProgress?: (ratio: number) => void;
}

const DEFAULTS: Required<Omit<VideoCompressOptions, "onProgress">> = {
  maxDimension: 1280,
  crf: 28,
  skipBelowBytes: 5 * 1024 * 1024, // 5 MB — not worth the transcode cost
};

// Pin the core to a version compatible with @ffmpeg/ffmpeg 0.12.x. Single-thread
// build (umd, not the -mt variant) so no SharedArrayBuffer requirement.
const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

const COMPRESSIBLE = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];

function isCompressibleVideo(file: File): boolean {
  // Some phones report empty/odd mime types; fall back to extension sniffing.
  if (COMPRESSIBLE.includes(file.type)) return true;
  return /\.(mp4|mov|avi|webm|m4v)$/i.test(file.name);
}

let ffmpegPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ffmpeg;
    })().catch((err) => {
      // Allow a later retry (e.g. CDN hiccup) instead of caching the failure.
      ffmpegPromise = null;
      throw err;
    });
  }
  return ffmpegPromise;
}

// ffmpeg.wasm holds one virtual filesystem and cannot run two transcodes at
// once, so serialise every call through a single chained promise.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Compress a single video. Returns the original file unchanged when it is not a
 * video, is already small, or if anything goes wrong.
 */
export async function compressVideo(
  file: File,
  opts: VideoCompressOptions = {},
): Promise<File> {
  const { maxDimension, crf, skipBelowBytes } = { ...DEFAULTS, ...opts };

  if (!isCompressibleVideo(file) || file.size <= skipBelowBytes) {
    return file;
  }

  const run = queue.then(() => transcode(file, maxDimension, crf, opts.onProgress));
  // Keep the queue alive even if this job throws.
  queue = run.catch(() => undefined);
  return run;
}

async function transcode(
  file: File,
  maxDimension: number,
  crf: number,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  let ffmpeg: FFmpeg;
  try {
    ffmpeg = await getFFmpeg();
  } catch {
    return file; // core failed to load — upload raw
  }

  const inName = "input";
  const outName = "output.mp4";
  const progressHandler = ({ progress }: { progress: number }) => {
    if (onProgress) onProgress(Math.max(0, Math.min(1, progress)));
  };

  try {
    ffmpeg.on("progress", progressHandler);
    await ffmpeg.writeFile(inName, await fetchFile(file));

    // Scale so the longest edge <= maxDimension, keep aspect, force even dims
    // (x264 requirement). Downscale only — never upscale.
    const scale = `scale='if(gt(iw,ih),min(${maxDimension},iw),-2)':'if(gt(iw,ih),-2,min(${maxDimension},ih))'`;

    await ffmpeg.exec([
      "-i", inName,
      "-vf", scale,
      "-c:v", "libx264",
      "-crf", String(crf),
      "-preset", "veryfast",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outName,
    ]);

    const data = (await ffmpeg.readFile(outName)) as Uint8Array;

    // Best-effort cleanup of the in-memory FS so repeated runs don't grow.
    await ffmpeg.deleteFile(inName).catch(() => undefined);
    await ffmpeg.deleteFile(outName).catch(() => undefined);

    // Keep whichever is smaller — transcoding can occasionally grow a clip.
    if (!data.length || data.length >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".mp4";
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return new File([buffer as ArrayBuffer], newName, {
      type: "video/mp4",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    ffmpeg.off("progress", progressHandler);
  }
}

/** Compress many videos sequentially (ffmpeg can only do one at a time). */
export async function compressVideos(
  files: File[],
  opts: VideoCompressOptions = {},
): Promise<File[]> {
  const result: File[] = [];
  for (const file of files) {
    result.push(await compressVideo(file, opts));
  }
  return result;
}
