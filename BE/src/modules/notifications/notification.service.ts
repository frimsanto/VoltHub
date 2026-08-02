import { NotificationType } from '@prisma/client';
import { notificationRepository, NotificationRepository } from './notification.repository';
import { renderEvent, EventContext } from './notification.events';

/**
 * Notification Service — the create + read core of the notification system.
 *
 * `notify()` is the single entry point used by the dispatcher: it fans a single
 * logical event out to one or more recipients, creating one inbox row per
 * recipient (idempotent via the dedupe key) and enqueuing a push delivery for
 * each newly-created row. It NEVER throws — notifications must never break the
 * business action that triggered them (mirrors pushService's best-effort
 * contract).
 *
 * Channels:
 *   • in-app  — the `notifications` row itself (read synchronously by the FE).
 *   • push    — a `notification_deliveries` row drained by the queue worker.
 */

export interface NotifyInput {
  type: NotificationType;
  /** Recipient user ids (deduplicated; empty self-recipient filtered upstream). */
  recipientIds: string[];
  entityType?: string | null;
  entityId?: string | null;
  context?: EventContext;
  /** Extra key material so distinct transitions on one entity aren't deduped. */
  dedupeDiscriminator?: string;
  /** Extra fields merged into the push `data` payload (deep-link routing). */
  data?: Record<string, string>;
  /** Enable the push channel for this event (default true). */
  push?: boolean;
}

const buildDedupeKey = (input: NotifyInput): string =>
  [input.type, input.entityType ?? '', input.entityId ?? '', input.dedupeDiscriminator ?? '']
    .join(':')
    .slice(0, 255);

export class NotificationService {
  constructor(private readonly repo: NotificationRepository = notificationRepository) {}

  /**
   * Fan an event out to its recipients. Returns the number of inbox rows
   * actually created (duplicates and failures are skipped). Best-effort.
   */
  async notify(input: NotifyInput): Promise<number> {
    const recipients = [...new Set(input.recipientIds.filter(Boolean))];
    if (recipients.length === 0) return 0;

    const { title, body } = renderEvent(input.type, input.context ?? {});
    const dedupeKey = buildDedupeKey(input);
    const baseData: Record<string, string> = {
      type: input.type,
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.entityId ? { entityId: input.entityId } : {}),
      ...(input.data ?? {}),
    };

    let created = 0;
    for (const userId of recipients) {
      try {
        const notification = await this.repo.createIfNew({
          userId,
          type: input.type,
          title,
          body,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          data: baseData,
          dedupeKey,
        });
        if (!notification) continue; // duplicate — already delivered
        created += 1;

        if (input.push !== false) {
          await this.repo.enqueueDelivery(notification.id, 'PUSH');
        }
      } catch (err) {
        console.error('[notification] failed to create for user', userId, err);
      }
    }
    return created;
  }

  // ── Inbox API (controller-facing) ───────────────────────────────────────────

  async list(userId: string, page: number, limit: number, unreadOnly?: boolean) {
    const { data, total, unread } = await this.repo.list({ userId, page, limit, unreadOnly });
    return {
      data: data.map((n) => ({
        ...n,
        data: n.data ? safeParse(n.data) : null,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), unread },
    };
  }

  unreadCount(userId: string) {
    return this.repo.unreadCount(userId);
  }

  markRead(userId: string, id: string) {
    return this.repo.markRead(userId, id);
  }

  markAllRead(userId: string) {
    return this.repo.markAllRead(userId);
  }
}

const safeParse = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

export const notificationService = new NotificationService();
