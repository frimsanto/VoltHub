import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import prisma from '../../config/database';
import { GiAttachmentStatus } from '@prisma/client';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Configurable constants via environment variables
export const VIDEO_MAX_DURATION_SEC = Number(process.env.VIDEO_MAX_DURATION_SEC || 180); // Default 3 minutes

export function validateFileMime(filePath: string, category: string): { isValid: boolean; mimeType: string } {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    const hex = buffer.toString('hex').toUpperCase();

    if (category === 'FOTO' || category === 'SLD') {
      if (hex.startsWith('89504E47')) {
        return { isValid: true, mimeType: 'image/png' };
      }
      if (hex.startsWith('FFD8FF')) {
        return { isValid: true, mimeType: 'image/jpeg' };
      }
      return { isValid: false, mimeType: '' };
    }

    if (category === 'LOGGER') {
      if (hex.startsWith('D0CF11E0A1B11AE1')) {
        return { isValid: true, mimeType: 'application/vnd.ms-excel' };
      }
      if (hex.startsWith('504B0304')) {
        return { isValid: true, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
      }
      // Check if it is text (CSV/TXT) and doesn't contain HTML tags (to prevent stored XSS)
      const textContent = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 1000);
      const hasHtml = /<[a-z/][\s>]/i.test(textContent) || textContent.includes('<script');
      if (!hasHtml) {
        return { isValid: true, mimeType: 'text/csv' };
      }
      return { isValid: false, mimeType: '' };
    }

    if (category === 'VIDEO') {
      const hasFtyp = hex.substring(8, 16) === '66747970';
      if (hasFtyp) {
        return { isValid: true, mimeType: 'video/mp4' };
      }
      return { isValid: false, mimeType: '' };
    }
  } catch (err) {
    console.error('[Mime Validation] Error validating file:', err);
  }
  return { isValid: false, mimeType: '' };
}

export function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    if (!ffmpegPath) return resolve(0);
    exec(`"${ffmpegPath}" -i "${filePath}"`, (error, stdout, stderr) => {
      // Duration is in stderr, formatted as: Duration: 00:01:23.45
      const match = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/i.exec(stderr);
      if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseFloat(match[3]);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        return resolve(Math.round(totalSeconds));
      }
      resolve(0);
    });
  });
}

class VideoCompressorQueue {
  private queue: string[] = [];
  private isProcessing = false;

  enqueue(attachmentId: string) {
    if (!this.queue.includes(attachmentId)) {
      this.queue.push(attachmentId);
      console.log(`[Video Worker] Enqueued attachment ID: ${attachmentId}`);
    }
    if (!this.isProcessing) {
      this.processNext();
    }
  }

  async resumePending() {
    try {
      console.log('[Video Worker] Checking for pending/stuck PROCESSING videos on boot...');
      const pending = await prisma.laporanGiAttachment.findMany({
        where: { status: GiAttachmentStatus.PROCESSING, deletedAt: null },
        select: { id: true }
      });
      if (pending.length > 0) {
        console.log(`[Video Worker] Found ${pending.length} pending videos. Enqueuing...`);
        pending.forEach(att => this.enqueue(att.id));
      } else {
        console.log('[Video Worker] No pending videos found.');
      }
    } catch (err) {
      console.error('[Video Worker] Failed to resume pending videos:', err);
    }
  }

  private async processNext() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const attachmentId = this.queue.shift()!;
    console.log(`[Video Worker] Processing attachment ID: ${attachmentId}`);

    try {
      const att = await prisma.laporanGiAttachment.findUnique({
        where: { id: attachmentId }
      });

      if (!att || att.deletedAt || att.status !== GiAttachmentStatus.PROCESSING) {
        console.log(`[Video Worker] Attachment ${attachmentId} not eligible for processing.`);
        this.processNext();
        return;
      }

      const originalPath = att.originalPath;
      if (!originalPath || !fs.existsSync(originalPath)) {
        throw new Error(`Original raw video file not found at path: ${originalPath}`);
      }

      // Check duration
      const duration = await getVideoDuration(originalPath);
      if (duration > VIDEO_MAX_DURATION_SEC) {
        throw new Error(`Video duration of ${duration}s exceeds configured maximum limit of ${VIDEO_MAX_DURATION_SEC}s`);
      }

      // Target path for compressed video
      const compressedDir = path.dirname(att.filePath);
      if (!fs.existsSync(compressedDir)) {
        fs.mkdirSync(compressedDir, { recursive: true });
      }

      // Generate poster path
      const posterDir = path.join(path.dirname(compressedDir), 'posters');
      if (!fs.existsSync(posterDir)) {
        fs.mkdirSync(posterDir, { recursive: true });
      }
      const posterFilename = `${att.id}_poster.png`;
      const posterPath = path.join(posterDir, posterFilename);

      console.log(`[Video Worker] Compressing video: ${originalPath} -> ${att.filePath}`);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(originalPath)
          .videoCodec('libx264')
          .outputOptions('-crf 28')
          .audioCodec('aac')
          .videoFilters('scale=-2:720') // H.264 720p keeping aspect ratio (even width/height)
          .duration(VIDEO_MAX_DURATION_SEC)
          .on('end', () => {
            console.log(`[Video Worker] Video compression successful for ${attachmentId}`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`[Video Worker] ffmpeg error:`, err);
            reject(err);
          })
          .save(att.filePath);
      });

      // Generate poster screenshot
      console.log(`[Video Worker] Extracting poster to ${posterPath}`);
      await new Promise<void>((resolve, reject) => {
        ffmpeg(att.filePath)
          .screenshot({
            timestamps: ['1'],
            folder: posterDir,
            filename: posterFilename,
            size: '1280x720'
          })
          .on('end', () => {
            resolve();
          })
          .on('error', (err) => {
            console.error(`[Video Worker] Poster extraction error:`, err);
            // Don't fail the whole compression if poster extraction fails
            resolve();
          });
      });

      // Check if poster was generated, if not fallback/empty
      const finalPosterPath = fs.existsSync(posterPath) ? posterPath : null;

      // Update database record to READY
      const updatedSize = fs.statSync(att.filePath).size;
      await prisma.laporanGiAttachment.update({
        where: { id: att.id },
        data: {
          status: GiAttachmentStatus.READY,
          fileSize: updatedSize,
          thumbnailPath: finalPosterPath,
          durationSec: duration,
          originalPath: null, // Clear original raw video path on success
          errorMessage: null
        }
      });

      // Clean up raw video to save disk space
      try {
        if (fs.existsSync(originalPath)) {
          fs.unlinkSync(originalPath);
        }
      } catch (err) {
        console.error(`[Video Worker] Failed to delete raw original video:`, err);
      }

      console.log(`[Video Worker] Finished processing attachment ID: ${attachmentId}`);
    } catch (err: any) {
      console.error(`[Video Worker] Processing failed for ${attachmentId}:`, err);
      try {
        await prisma.laporanGiAttachment.update({
          where: { id: attachmentId },
          data: {
            status: GiAttachmentStatus.FAILED,
            errorMessage: err.message || 'Unknown compression error'
          }
        });
      } catch (dbErr) {
        console.error(`[Video Worker] Failed to update failed state in DB:`, dbErr);
      }
    }

    this.processNext();
  }
}

export const videoCompressorQueue = new VideoCompressorQueue();
