import axios from "axios";
import * as laporanAwalApi from "@/lib/api/laporanAwal";
import * as laporanAkhirApi from "@/lib/api/laporanAkhir";
import { uploadDocumentationAllInOne, uploadLaporanAkhirDocumentation } from "@/lib/api/upload";
import { v2Post, v2Upload } from "@/lib/api/v2";
import type { CreateLaporanAwalInput, LaporanAwal } from "@/lib/api/laporanAwal";
import type { CreateLaporanAkhirInput, LaporanAkhir } from "@/lib/api/laporanAkhir";
import type { CreateInspection, CreateFinding } from "@/lib/api/v2";
import {
  enqueueReport,
  getReadyItems,
  getQueue,
  removeFromQueue,
  updateQueueItem,
  type QueuedReport,
} from "./queue";
import {
  saveAttachments,
  getAttachments,
  deleteAttachments,
  type QueuedAttachments,
  type QueuedFinding,
} from "./attachmentStore";
import { isOnline } from "./connectivity";

/** After this many failed attempts an item is parked in `failed` (kept, manual). */
const MAX_ATTEMPTS = 5;

/** Exponential backoff (minutes) before a transiently-failed item is retried. */
function backoffMs(attempts: number): number {
  const minutes = Math.min(2 ** attempts, 30); // 2,4,8,16,30,30…
  return minutes * 60_000;
}

/**
 * True when an error means "no connectivity" (request never reached the server)
 * rather than a server-side rejection. Only these are safe to retry/queue.
 */
export function isOfflineError(error: unknown): boolean {
  if (!isOnline()) return true;
  if (axios.isAxiosError(error)) {
    return !error.response && error.code !== "ECONNABORTED";
  }
  return false;
}

/**
 * True when the server actively reports a conflict — the record likely already
 * exists (idempotency replay / duplicate). These need a human decision rather
 * than blind retry, so they are parked in `conflict`.
 */
export function isConflictError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 409;
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { message?: string })?.message || error.message;
  }
  return String(error);
}

export interface OrQueueResult<T> {
  queued: boolean;
  result?: T;
}

// ── Offline inspection payload ────────────────────────────────────────────────
// Inspections are multi-step (create → findings → per-finding photo upload), so
// the queued payload also tracks server-side progress to make replay resumable
// and duplicate-safe after a partial failure.
interface QueuedInspectionPayload {
  inspection: CreateInspection;
  createdId?: string;
  doneFindings?: number;
}

function offlineToggle(): boolean {
  return !isOnline();
}

async function queueReport(
  kind: QueuedReport["kind"],
  payload: unknown,
  attachments: QueuedAttachments,
  label?: string,
): Promise<void> {
  const item = enqueueReport(kind, payload, label);
  await saveAttachments(item.id, attachments);
}

/** Idempotency header replayed on every send so retries can't duplicate. */
function idempotency(clientId: string) {
  return { headers: { "X-Idempotency-Key": clientId } };
}

// ── Create-or-queue helpers (called from the report/inspection forms) ──────────

/** Submit a Laporan Awal, or queue it (with photos) for later if offline. */
export async function createLaporanAwalOrQueue(
  payload: CreateLaporanAwalInput,
  dokumentasi: File[] = [],
  label?: string,
): Promise<OrQueueResult<LaporanAwal>> {
  if (offlineToggle()) {
    await queueReport("laporan-awal", payload, { dokumentasi }, label);
    return { queued: true };
  }
  try {
    const result = await laporanAwalApi.create(payload);
    return { queued: false, result };
  } catch (error) {
    if (isOfflineError(error)) {
      await queueReport("laporan-awal", payload, { dokumentasi }, label);
      return { queued: true };
    }
    throw error;
  }
}

/** Submit a Laporan Akhir, or queue it (with categorized files) if offline. */
export async function createLaporanAkhirOrQueue(
  payload: CreateLaporanAkhirInput,
  files: Pick<QueuedAttachments, "logger" | "sld" | "dokumentasiHasil"> = {},
  label?: string,
): Promise<OrQueueResult<LaporanAkhir>> {
  if (offlineToggle()) {
    await queueReport("laporan-akhir", payload, files, label);
    return { queued: true };
  }
  try {
    const result = await laporanAkhirApi.create(payload);
    return { queued: false, result };
  } catch (error) {
    if (isOfflineError(error)) {
      await queueReport("laporan-akhir", payload, files, label);
      return { queued: true };
    }
    throw error;
  }
}

/**
 * Submit an inspection (plus its findings/photos), or queue it for later if
 * offline. `findings` may carry one photo each; they replay after the parent
 * inspection is created.
 */
export async function createInspectionOrQueue(
  inspection: CreateInspection,
  findings: QueuedFinding[] = [],
  label?: string,
): Promise<OrQueueResult<{ id: string }>> {
  const payload: QueuedInspectionPayload = { inspection };
  const enqueue = () => queueReport("inspection", payload, { findings }, label);

  if (offlineToggle()) {
    await enqueue();
    return { queued: true };
  }
  try {
    const created = await v2Post<{ id: string }, CreateInspection>("/inspections", inspection);
    await replayFindings(created.id, findings);
    return { queued: false, result: created };
  } catch (error) {
    if (isOfflineError(error)) {
      await enqueue();
      return { queued: true };
    }
    throw error;
  }
}

/**
 * Submit a Laporan GI (Inspeksi GI / HAR GI), or queue it for later if offline.
 * Form GI tidak punya lampiran foto di fase ini, jadi payload = body JSON saja.
 */
export async function createGiReportOrQueue<T extends { id: string }>(
  kind: "inspeksi-gi" | "har-gi",
  path: "/gi/inspeksi" | "/gi/har",
  payload: Record<string, unknown>,
  label?: string,
): Promise<OrQueueResult<T>> {
  if (offlineToggle()) {
    await queueReport(kind, payload, {}, label);
    return { queued: true };
  }
  try {
    const result = await v2Post<T, Record<string, unknown>>(path, payload);
    return { queued: false, result };
  } catch (error) {
    if (isOfflineError(error)) {
      await queueReport(kind, payload, {}, label);
      return { queued: true };
    }
    throw error;
  }
}

// ── Replay (used by both direct submit and queue flush) ────────────────────────

async function replayFindings(inspectionId: string, findings: QueuedFinding[]): Promise<void> {
  for (const f of findings) {
    const body: CreateFinding = {
      assetId: f.assetId,
      status: f.status,
      finding: f.finding ?? null,
      recommendation: f.recommendation ?? null,
    };
    const finding = await v2Post<{ id: string }, CreateFinding>(
      `/inspections/${inspectionId}/findings`,
      body,
    );
    if (f.photo) {
      const form = new FormData();
      form.append("photo", f.photo);
      if (f.caption) form.append("caption", f.caption);
      await v2Upload(`/findings/${finding.id}/photos`, form);
    }
  }
}

/** Create the queued record, then upload any stored attachments for the item. */
async function submitQueued(item: QueuedReport): Promise<void> {
  const att = await getAttachments(item.id);
  const cfg = idempotency(item.clientId);

  if (item.kind === "laporan-awal") {
    const created = await laporanAwalApi.create(item.payload as CreateLaporanAwalInput, cfg);
    if (att?.dokumentasi?.length) {
      await uploadDocumentationAllInOne("laporan-awal", created.id, att.dokumentasi);
    }
    await deleteAttachments(item.id);
    return;
  }

  if (item.kind === "laporan-akhir") {
    const created = await laporanAkhirApi.create(item.payload as CreateLaporanAkhirInput, cfg);
    if (att && (att.logger?.length || att.sld?.length || att.dokumentasiHasil?.length)) {
      await uploadLaporanAkhirDocumentation(created.id, {
        logger: att.logger,
        sld: att.sld,
        dokumentasiHasil: att.dokumentasiHasil,
      });
    }
    await deleteAttachments(item.id);
    return;
  }

  if (item.kind === "inspeksi-gi" || item.kind === "har-gi") {
    const path = item.kind === "inspeksi-gi" ? "/gi/inspeksi" : "/gi/har";
    await v2Post<{ id: string }, Record<string, unknown>>(
      path,
      item.payload as Record<string, unknown>,
      cfg,
    );
    await deleteAttachments(item.id);
    return;
  }

  // inspection — resumable multi-step replay (create → findings → photos).
  const payload = item.payload as QueuedInspectionPayload;
  let createdId = payload.createdId;
  if (!createdId) {
    const created = await v2Post<{ id: string }, CreateInspection>(
      "/inspections",
      payload.inspection,
      cfg,
    );
    createdId = created.id;
    // Persist progress so a later partial failure does not recreate the parent.
    updateQueueItem(item.id, { payload: { ...payload, createdId } });
  }
  const findings = att?.findings ?? [];
  const start = payload.doneFindings ?? 0;
  for (let i = start; i < findings.length; i++) {
    await replayFindings(createdId, [findings[i]]);
    updateQueueItem(item.id, { payload: { ...payload, createdId, doneFindings: i + 1 } });
  }
  await deleteAttachments(item.id);
}

export interface FlushResult {
  synced: number;
  failed: number;
  conflicts: number;
  /** True when the flush stopped early because the connection dropped. */
  interrupted: boolean;
}

let flushing = false;

/**
 * Replay every ready queued record (and its photos). Items are sent oldest-first.
 * Behaviour per outcome:
 *  - success   → removed from the queue.
 *  - offline   → stop early (connection dropped); item stays pending.
 *  - conflict  → parked in `conflict` (needs user decision).
 *  - other err → attempts++ with exponential backoff; after MAX_ATTEMPTS parked
 *                in `failed`. Items are NEVER dropped — no data loss.
 *
 * Safe to call repeatedly — guarded against re-entry.
 */
export async function flushOfflineQueue(): Promise<FlushResult> {
  const result: FlushResult = { synced: 0, failed: 0, conflicts: 0, interrupted: false };
  if (flushing || !isOnline()) return result;
  flushing = true;
  try {
    for (const item of getReadyItems()) {
      updateQueueItem(item.id, { status: "syncing" });
      try {
        await submitQueued(item);
        removeFromQueue(item.id);
        result.synced++;
      } catch (error) {
        if (isOfflineError(error)) {
          updateQueueItem(item.id, { status: "pending" });
          result.interrupted = true;
          break; // connection dropped again — resume later
        }
        const message = errorMessage(error);
        if (isConflictError(error)) {
          updateQueueItem(item.id, { status: "conflict", lastError: message });
          result.conflicts++;
          continue;
        }
        const attempts = item.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          updateQueueItem(item.id, { status: "failed", attempts, lastError: message });
          result.failed++;
        } else {
          updateQueueItem(item.id, {
            status: "pending",
            attempts,
            lastError: message,
            nextAttemptAt: new Date(Date.now() + backoffMs(attempts)).toISOString(),
          });
        }
      }
    }
  } finally {
    flushing = false;
  }
  return result;
}

/** Discard a queue item and any attachments it owns (user action — destructive). */
export async function discardQueueItem(id: string): Promise<void> {
  removeFromQueue(id);
  await deleteAttachments(id);
}

/** True if there is anything at all to sync (pending or parked). */
export function hasQueuedWork(): boolean {
  return getQueue().length > 0;
}
