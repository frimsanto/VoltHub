import { notificationRepository, NotificationRepository } from './notification.repository';
import { sendToUserResult, PushPayload } from '../../services/pushService';

/**
 * Notification delivery queue worker.
 *
 * A dependency-free, in-process queue (no Redis/BullMQ — consistent with the
 * rest of the stack). On each tick it claims a batch of due `PENDING` deliveries,
 * pushes each via FCM, and applies the retry policy:
 *
 *   • sent / skipped (push disabled or no devices) → SENT (terminal, no retry).
 *   • thrown transport error                       → attempts++, reschedule with
 *     exponential backoff (PENDING), or DEAD once maxAttempts is reached.
 *
 * The worker is idempotent at the row level (claim flips PENDING→PROCESSING under
 * a guarded updateMany) and self-healing (reclaims rows stuck in PROCESSING after
 * a crash). Start it once from index.ts; stop it on graceful shutdown.
 */

export interface QueueOptions {
  /** Poll interval in ms. */
  intervalMs?: number;
  /** Max deliveries claimed per tick. */
  batchSize?: number;
  /** Backoff base in ms (delay = base * 2^(attempt-1), capped). */
  backoffBaseMs?: number;
  /** Backoff cap in ms. */
  backoffMaxMs?: number;
  /** Reclaim PROCESSING rows older than this (ms) as stuck. */
  staleMs?: number;
}

const DEFAULTS: Required<QueueOptions> = {
  intervalMs: 10_000,
  batchSize: 25,
  backoffBaseMs: 30_000, // 30s, 60s, 120s, 240s, 480s
  backoffMaxMs: 30 * 60_000, // 30 min cap
  staleMs: 2 * 60_000,
};

export class NotificationQueue {
  private timer: NodeJS.Timeout | null = null;
  private running = false; // re-entrancy guard for overlapping ticks
  private readonly opts: Required<QueueOptions>;

  constructor(
    private readonly repo: NotificationRepository = notificationRepository,
    options: QueueOptions = {}
  ) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /** Begin polling. Safe to call once; no-op if already started. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.opts.intervalMs);
    // Don't keep the event loop alive solely for the queue.
    this.timer.unref?.();
    console.log(`[notification.queue] started (every ${this.opts.intervalMs}ms)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private backoff(attempt: number): Date {
    const delay = Math.min(
      this.opts.backoffBaseMs * 2 ** (attempt - 1),
      this.opts.backoffMaxMs
    );
    return new Date(Date.now() + delay);
  }

  /**
   * Process one batch. Exposed (not just the timer) so it can be driven
   * synchronously from tests or a manual flush. Returns counts for observability.
   */
  async tick(): Promise<{ processed: number; sent: number; failed: number }> {
    if (this.running) return { processed: 0, sent: 0, failed: 0 };
    this.running = true;
    let sent = 0;
    let failed = 0;
    try {
      // Re-arm anything stuck mid-flight from a previous crash.
      await this.repo.reclaimStale(new Date(Date.now() - this.opts.staleMs));

      const batch = await this.repo.claimDueDeliveries(this.opts.batchSize);
      for (const delivery of batch) {
        const n = delivery.notification;
        const payload: PushPayload = {
          title: n.title,
          body: n.body,
          data: {
            notificationId: n.id,
            type: n.type,
            ...(n.entityType ? { entityType: n.entityType } : {}),
            ...(n.entityId ? { entityId: n.entityId } : {}),
            ...flattenData(n.data),
          },
        };

        try {
          await sendToUserResult(n.userId, payload);
          await this.repo.markDeliverySent(delivery.id);
          sent += 1;
        } catch (err) {
          const attempts = delivery.attempts + 1;
          await this.repo.markDeliveryFailed({
            id: delivery.id,
            attempts,
            maxAttempts: delivery.maxAttempts,
            error: err instanceof Error ? err.message : String(err),
            nextAttemptAt: this.backoff(attempts),
          });
          failed += 1;
        }
      }
      return { processed: batch.length, sent, failed };
    } catch (err) {
      console.error('[notification.queue] tick failed:', err);
      return { processed: 0, sent, failed };
    } finally {
      this.running = false;
    }
  }
}

/** Merge the stored JSON `data` blob into the flat string map FCM requires. */
const flattenData = (raw: string | null): Record<string, string> => {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v != null) out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return out;
  } catch {
    return {};
  }
};

export const notificationQueue = new NotificationQueue();
