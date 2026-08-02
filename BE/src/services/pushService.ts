import prisma from '../config/database';
import { env } from '../config/env';

/**
 * Push notifications via Firebase Cloud Messaging (legacy HTTP API).
 * Sending is a no-op when FCM_SERVER_KEY is unset, so the app runs fine without
 * Firebase configured. Failures never throw to the caller — notifications are
 * best-effort and must not break the report workflow.
 */

export const registerDeviceToken = async (
  userId: string,
  token: string,
  platform?: string
) => {
  // Upsert by token: the same device may re-register, or move between users.
  return prisma.deviceToken.upsert({
    where: { token },
    create: { userId, token, platform: platform ?? null },
    update: { userId, platform: platform ?? null },
  });
};

export const removeDeviceToken = async (token: string) => {
  await prisma.deviceToken.deleteMany({ where: { token } });
};

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** Outcome of a push send — lets the notification queue decide whether to retry. */
export type PushResult =
  | { status: 'sent'; recipients: number }
  | { status: 'skipped'; reason: 'push_disabled' | 'no_devices' };

/**
 * Send a notification to every device registered to a user and report the
 * outcome. Throws on a transport/HTTP failure so a caller (the delivery queue)
 * can retry; returns a `skipped` result when push is disabled or the user has no
 * devices (a terminal, non-retryable state).
 */
export const sendToUserResult = async (
  userId: string,
  payload: PushPayload
): Promise<PushResult> => {
  if (!env.FCM_SERVER_KEY) return { status: 'skipped', reason: 'push_disabled' };

  const tokens = await prisma.deviceToken.findMany({
    where: { userId },
    select: { token: true },
  });
  if (tokens.length === 0) return { status: 'skipped', reason: 'no_devices' };

  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      Authorization: `key=${env.FCM_SERVER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      registration_ids: tokens.map((t) => t.token),
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      priority: 'high',
    }),
  });

  if (!res.ok) {
    throw new Error(`FCM responded ${res.status} ${res.statusText}`);
  }

  // Prune tokens FCM reports as invalid so the table doesn't grow stale.
  const json = (await res.json()) as { results?: Array<{ error?: string }> };
  const results = json.results ?? [];
  const dead = tokens
    .filter((_, i) => {
      const err = results[i]?.error;
      return err === 'NotRegistered' || err === 'InvalidRegistration';
    })
    .map((t) => t.token);
  if (dead.length > 0) {
    await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
  }

  return { status: 'sent', recipients: tokens.length };
};

/**
 * Best-effort fire-and-forget send (legacy callers: laporanAwal/akhir services).
 * Never throws — failures are logged and dropped. New code that needs retry
 * should enqueue a notification (see modules/notifications) instead.
 */
export const sendToUser = async (userId: string, payload: PushPayload): Promise<void> => {
  try {
    await sendToUserResult(userId, payload);
  } catch (err) {
    console.error('[push] send failed:', err);
  }
};
