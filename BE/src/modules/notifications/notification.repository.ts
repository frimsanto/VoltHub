import { Prisma, NotificationType, NotificationDeliveryStatus } from '@prisma/client';
import prisma from '../../config/database';

/**
 * Notification Repository — persistence for the per-user inbox (`notifications`)
 * and the delivery queue (`notification_deliveries`).
 *
 * Duplicate prevention lives here: `createIfNew` relies on the
 * `(userId, dedupeKey)` unique index and swallows the P2002 unique-violation so a
 * replayed/duplicated trigger is an idempotent no-op (returns null).
 */

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  data?: Record<string, unknown> | null;
  dedupeKey: string;
}

export interface ListNotificationParams {
  userId: string;
  page: number;
  limit: number;
  unreadOnly?: boolean;
}

const serialize = (value: unknown): string | null => {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

export class NotificationRepository {
  /**
   * Insert a notification unless one with the same (userId, dedupeKey) already
   * exists. Returns the created row, or null when it was a duplicate (no-op).
   */
  async createIfNew(data: CreateNotificationData) {
    try {
      return await prisma.notification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          body: data.body,
          entityType: data.entityType ?? null,
          entityId: data.entityId ?? null,
          data: serialize(data.data),
          dedupeKey: data.dedupeKey,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return null; // duplicate — idempotent no-op
      }
      throw err;
    }
  }

  /** Enqueue a delivery attempt-set for a notification on a channel. */
  enqueueDelivery(notificationId: string, channel = 'PUSH', maxAttempts = 5) {
    return prisma.notificationDelivery.create({
      data: { notificationId, channel, maxAttempts },
    });
  }

  // ── Inbox reads ────────────────────────────────────────────────────────────

  async list({ userId, page, limit, unreadOnly }: ListNotificationParams) {
    const skip = (page - 1) * limit;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [data, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return { data, total, unread, page, limit };
  }

  unreadCount(userId: string) {
    return prisma.notification.count({ where: { userId, readAt: null } });
  }

  // ── Inbox writes (read-state) ───────────────────────────────────────────────

  /** Mark a single notification read — scoped to the owner. Returns rows updated. */
  async markRead(userId: string, id: string): Promise<number> {
    const res = await prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }

  async markAllRead(userId: string): Promise<number> {
    const res = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }

  findOwned(userId: string, id: string) {
    return prisma.notification.findFirst({ where: { id, userId } });
  }

  // ── Queue / delivery (worker side) ──────────────────────────────────────────

  /**
   * Atomically claim up to `limit` due deliveries: flip PENDING rows whose
   * nextAttemptAt has passed to PROCESSING, then return them. The guarded
   * updateMany (status: PENDING) makes the claim safe against a double tick.
   */
  async claimDueDeliveries(limit: number, now = new Date()) {
    const due = await prisma.notificationDelivery.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    if (due.length === 0) return [];

    const ids = due.map((d) => d.id);
    await prisma.notificationDelivery.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });

    return prisma.notificationDelivery.findMany({
      where: { id: { in: ids }, status: 'PROCESSING' },
      include: { notification: true },
    });
  }

  markDeliverySent(id: string) {
    return prisma.notificationDelivery.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), lastError: null },
    });
  }

  /** Record a failed attempt: reschedule (PENDING) or give up (DEAD). */
  markDeliveryFailed(params: {
    id: string;
    attempts: number;
    maxAttempts: number;
    error: string;
    nextAttemptAt: Date;
  }) {
    const exhausted = params.attempts >= params.maxAttempts;
    const status: NotificationDeliveryStatus = exhausted ? 'DEAD' : 'PENDING';
    return prisma.notificationDelivery.update({
      where: { id: params.id },
      data: {
        status,
        attempts: params.attempts,
        lastError: params.error.slice(0, 1000),
        nextAttemptAt: params.nextAttemptAt,
      },
    });
  }

  /** Re-arm rows stuck in PROCESSING (e.g. a crash mid-tick) so they retry. */
  async reclaimStale(olderThan: Date) {
    const res = await prisma.notificationDelivery.updateMany({
      where: { status: 'PROCESSING', updatedAt: { lt: olderThan } },
      data: { status: 'PENDING' },
    });
    return res.count;
  }

  // ── Recipient resolution helpers ────────────────────────────────────────────

  /** Active admin-tier users (SUPER_ADMIN/ADMIN, incl. legacy enum values). */
  async findAdminUserIds(): Promise<string[]> {
    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ['SUPERADMIN', 'SUPER_ADMIN', 'ADMIN', 'ADMIN_RTUPP'] as never },
      },
      select: { id: true },
    });
    return admins.map((u) => u.id);
  }

  /** Active admin-tier users within a specific RTUPP. */
  async findAdminUserIdsByRtupp(rtuppId: string): Promise<string[]> {
    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        rtuppId,
        role: { in: ['SUPERADMIN', 'SUPER_ADMIN', 'ADMIN', 'ADMIN_RTUPP'] as never },
      },
      select: { id: true },
    });
    return admins.map((u) => u.id);
  }

  userName(userId: string) {
    return prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  }
}

export const notificationRepository = new NotificationRepository();
