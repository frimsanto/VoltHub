// Routes a mixed batch of attachments to the right compressor: images via
// canvas re-encode, videos via ffmpeg.wasm. Anything else (PDF, XLSX logger)
// passes through untouched. Order is preserved so callers that map file
// positions to categories stay correct.
//
// Images compress concurrently; videos serialise internally (ffmpeg can only
// transcode one clip at a time), so a single Promise.all over the batch gives
// the right behaviour for both.

import { compressImage } from "./imageCompression";
import { compressVideo } from "./videoCompression";

function isVideo(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|mov|avi|webm|m4v)$/i.test(file.name);
}

export async function compressMedia(files: File[]): Promise<File[]> {
  return Promise.all(
    files.map((file) => (isVideo(file) ? compressVideo(file) : compressImage(file))),
  );
}
