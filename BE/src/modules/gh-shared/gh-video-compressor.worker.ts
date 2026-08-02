// VoltHub — Video compressor queue GENERIK untuk lampiran GH (Inspeksi & HAR GH).
// Reuse fungsi murni (validateFileMime/getVideoDuration) dari worker Laporan GI
// via IMPORT SAJA (read-only) — tidak menyentuh/mengubah modul GI.
// Attachment table GH punya bentuk identik (mirror LaporanGiAttachment) sehingga
// satu factory queue dipakai untuk kedua tabel (parameterized by delegate).
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { GiAttachmentStatus } from '@prisma/client';
import { getVideoDuration, VIDEO_MAX_DURATION_SEC } from '../laporan-gi/video-compressor.worker';

export { validateFileMime, getVideoDuration, VIDEO_MAX_DURATION_SEC } from '../laporan-gi/video-compressor.worker';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

interface GhAttachmentRow {
  id: string;
  status: GiAttachmentStatus;
  filePath: string;
  originalPath: string | null;
  deletedAt: Date | null;
}

// Minimal shape of a Prisma delegate needed by the queue (findUnique/update/findMany).
interface GhAttachmentDelegate {
  findUnique(args: { where: { id: string } }): Promise<GhAttachmentRow | null>;
  findMany(args: unknown): Promise<GhAttachmentRow[]>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
}

export function createGhVideoCompressorQueue(label: string, delegate: GhAttachmentDelegate) {
  const queue: string[] = [];
  let isProcessing = false;

  async function processNext(): Promise<void> {
    if (queue.length === 0) {
      isProcessing = false;
      return;
    }
    isProcessing = true;
    const attachmentId = queue.shift()!;
    console.log(`[${label} Video Worker] Processing attachment ID: ${attachmentId}`);

    try {
      const att = await delegate.findUnique({ where: { id: attachmentId } });
      if (!att || att.deletedAt || att.status !== GiAttachmentStatus.PROCESSING) {
        console.log(`[${label} Video Worker] Attachment ${attachmentId} not eligible for processing.`);
        return processNext();
      }

      const originalPath = att.originalPath;
      if (!originalPath || !fs.existsSync(originalPath)) {
        throw new Error(`Original raw video file not found at path: ${originalPath}`);
      }

      const duration = await getVideoDuration(originalPath);
      if (duration > VIDEO_MAX_DURATION_SEC) {
        throw new Error(`Video duration of ${duration}s exceeds configured maximum limit of ${VIDEO_MAX_DURATION_SEC}s`);
      }

      const compressedDir = path.dirname(att.filePath);
      if (!fs.existsSync(compressedDir)) fs.mkdirSync(compressedDir, { recursive: true });

      const posterDir = path.join(path.dirname(compressedDir), 'posters');
      if (!fs.existsSync(posterDir)) fs.mkdirSync(posterDir, { recursive: true });
      const posterFilename = `${att.id}_poster.png`;
      const posterPath = path.join(posterDir, posterFilename);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(originalPath)
          .videoCodec('libx264')
          .outputOptions('-crf 28')
          .audioCodec('aac')
          .videoFilters('scale=-2:720')
          .duration(VIDEO_MAX_DURATION_SEC)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .save(att.filePath);
      });

      await new Promise<void>((resolve) => {
        ffmpeg(att.filePath)
          .screenshot({ timestamps: ['1'], folder: posterDir, filename: posterFilename, size: '1280x720' })
          .on('end', () => resolve())
          .on('error', () => resolve());
      });

      const finalPosterPath = fs.existsSync(posterPath) ? posterPath : null;
      const updatedSize = fs.statSync(att.filePath).size;
      await delegate.update({
        where: { id: att.id },
        data: {
          status: GiAttachmentStatus.READY,
          fileSize: updatedSize,
          thumbnailPath: finalPosterPath,
          durationSec: duration,
          originalPath: null,
          errorMessage: null,
        },
      });

      try {
        if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
      } catch (err) {
        console.error(`[${label} Video Worker] Failed to delete raw original video:`, err);
      }
      console.log(`[${label} Video Worker] Finished processing attachment ID: ${attachmentId}`);
    } catch (err: unknown) {
      console.error(`[${label} Video Worker] Processing failed for ${attachmentId}:`, err);
      try {
        await delegate.update({
          where: { id: attachmentId },
          data: { status: GiAttachmentStatus.FAILED, errorMessage: err instanceof Error ? err.message : 'Unknown compression error' },
        });
      } catch (dbErr) {
        console.error(`[${label} Video Worker] Failed to update failed state in DB:`, dbErr);
      }
    }
    return processNext();
  }

  return {
    enqueue(attachmentId: string) {
      if (!queue.includes(attachmentId)) {
        queue.push(attachmentId);
        console.log(`[${label} Video Worker] Enqueued attachment ID: ${attachmentId}`);
      }
      if (!isProcessing) processNext();
    },
    async resumePending() {
      console.log(`[${label} Video Worker] Checking for pending/stuck PROCESSING videos on boot...`);
      const pending = await delegate.findMany({ where: { status: GiAttachmentStatus.PROCESSING, deletedAt: null }, select: { id: true } });
      pending.forEach((att) => this.enqueue(att.id));
    },
  };
}
