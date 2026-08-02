import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationQueue } from './notification.queue';
import type { NotificationRepository } from './notification.repository';

// Mock the push sender so no network/db is touched.
const sendMock = vi.fn();
vi.mock('../../services/pushService', () => ({
  sendToUserResult: (...args: unknown[]) => sendMock(...args),
}));

/** Minimal fake delivery row the queue expects from claimDueDeliveries. */
const delivery = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'd1',
  attempts: 0,
  maxAttempts: 5,
  notification: {
    id: 'n1',
    userId: 'u1',
    type: 'TICKET_CREATED',
    title: 'Tiket baru',
    body: 'halo',
    entityType: 'Ticket',
    entityId: 't1',
    data: JSON.stringify({ foo: 'bar' }),
  },
  ...over,
});

const makeRepo = () => {
  const repo = {
    reclaimStale: vi.fn().mockResolvedValue(0),
    claimDueDeliveries: vi.fn(),
    markDeliverySent: vi.fn().mockResolvedValue(undefined),
    markDeliveryFailed: vi.fn().mockResolvedValue(undefined),
  };
  return repo as unknown as NotificationRepository & typeof repo;
};

beforeEach(() => {
  sendMock.mockReset();
});

describe('NotificationQueue.tick', () => {
  it('marks a delivery SENT and forwards the deep-link data payload', async () => {
    const repo = makeRepo();
    repo.claimDueDeliveries.mockResolvedValue([delivery()]);
    sendMock.mockResolvedValue({ status: 'sent', recipients: 1 });

    const q = new NotificationQueue(repo);
    const res = await q.tick();

    expect(res).toMatchObject({ processed: 1, sent: 1, failed: 0 });
    expect(repo.markDeliverySent).toHaveBeenCalledWith('d1');
    // payload carries the routing metadata + flattened data blob
    const [, payload] = sendMock.mock.calls[0];
    expect(payload.data).toMatchObject({
      notificationId: 'n1',
      type: 'TICKET_CREATED',
      entityId: 't1',
      foo: 'bar',
    });
  });

  it('reschedules with backoff on transport failure (not yet exhausted)', async () => {
    const repo = makeRepo();
    repo.claimDueDeliveries.mockResolvedValue([delivery({ attempts: 1 })]);
    sendMock.mockRejectedValue(new Error('FCM responded 503'));

    const q = new NotificationQueue(repo, { backoffBaseMs: 1000 });
    const res = await q.tick();

    expect(res).toMatchObject({ sent: 0, failed: 1 });
    const arg = repo.markDeliveryFailed.mock.calls[0][0];
    expect(arg.attempts).toBe(2);
    expect(arg.error).toContain('503');
    expect(arg.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('treats push-disabled / no-devices as delivered (skipped → SENT)', async () => {
    const repo = makeRepo();
    repo.claimDueDeliveries.mockResolvedValue([delivery()]);
    sendMock.mockResolvedValue({ status: 'skipped', reason: 'push_disabled' });

    const q = new NotificationQueue(repo);
    await q.tick();

    expect(repo.markDeliverySent).toHaveBeenCalledWith('d1');
    expect(repo.markDeliveryFailed).not.toHaveBeenCalled();
  });

  it('does not run overlapping ticks (re-entrancy guard)', async () => {
    const repo = makeRepo();
    let resolveClaim: (v: unknown) => void = () => {};
    repo.claimDueDeliveries.mockReturnValue(
      new Promise((r) => {
        resolveClaim = r;
      })
    );

    const q = new NotificationQueue(repo);
    const first = q.tick();
    const second = await q.tick(); // should short-circuit
    expect(second).toMatchObject({ processed: 0 });

    resolveClaim([]);
    await first;
    expect(repo.claimDueDeliveries).toHaveBeenCalledTimes(1);
  });
});
