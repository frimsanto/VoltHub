import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import prisma from '../config/database';
import { isUniqueConstraintError } from '../utils/generateId';

/**
 * Idempotency middleware — the server-side half of the offline sync guarantee.
 *
 * The offline sync engine (FE/src/lib/offline) replays each queued report with a
 * stable `X-Idempotency-Key` (the queue item's clientId). Without server support
 * an *ambiguous* failure — the server commits the record but the response is lost
 * in transit — looks like an offline error to the client, which reverts the item
 * to `pending` and re-sends it, creating a DUPLICATE.
 *
 * This middleware closes that window:
 *
 *  1. Reserve the key by inserting a row (PRIMARY KEY = atomic). If the insert
 *     wins, the create handler runs normally.
 *  2. On the first success (2xx) the response body + status are stored against
 *     the key.
 *  3. A later submit with the SAME key finds a COMPLETED row and replays the
 *     stored response verbatim — the handler never runs again, so no duplicate.
 *  4. A concurrent submit that loses the reservation race (row still IN_PROGRESS)
 *     gets a 409, which the client parks as a `conflict` for review rather than
 *     blindly retrying.
 *  5. A failed/errored response RELEASES the key (row deleted) so the client can
 *     legitimately retry — errors are never cached.
 *
 * Fail-open: any unexpected DB error (e.g. the table not yet migrated) lets the
 * request through unguarded. The client-side no-data-loss guarantees still hold;
 * we simply lose dedup until the migration is applied. We never block a write.
 *
 * Requests without the header pass straight through (web app, non-queued calls).
 */
export const idempotency = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const key = req.header('X-Idempotency-Key');
  if (!key) {
    next();
    return;
  }

  const userId = req.user?.userId ?? null;
  const scope = `${req.method} ${req.baseUrl || req.path}`;

  // Phase 1 — reserve the key (atomic via PRIMARY KEY).
  try {
    await prisma.idempotencyKey.create({
      data: { key, userId, scope, status: 'IN_PROGRESS' },
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      // Key already seen — replay or reject, but never run the handler again.
      const existing = await prisma.idempotencyKey
        .findUnique({ where: { key } })
        .catch(() => null);

      if (existing?.status === 'COMPLETED' && existing.responseBody) {
        res.status(existing.statusCode ?? 200).json(JSON.parse(existing.responseBody));
        return;
      }

      // Still IN_PROGRESS — a concurrent submit is mid-flight. Tell the client
      // this is a duplicate (parked as `conflict`, not blindly retried).
      res.status(409).json({
        success: false,
        message: 'Permintaan dengan kunci idempotensi yang sama sedang diproses.',
        error: 'IDEMPOTENT_REPLAY_IN_PROGRESS',
      });
      return;
    }
    // Unknown DB error (e.g. table not migrated yet) — fail open, do not block.
    next();
    return;
  }

  // Phase 2 — run the handler, capturing its JSON response for storage.
  let captured: unknown;
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    captured = body;
    return originalJson(body);
  };

  // Persist (or release) once the response is fully sent. `finish` fires even
  // when the handler throws and the error middleware sends a 500 — that path
  // releases the key so the client may retry cleanly.
  res.on('finish', () => {
    const ok = res.statusCode >= 200 && res.statusCode < 300 && captured !== undefined;
    if (ok) {
      void prisma.idempotencyKey
        .update({
          where: { key },
          data: {
            status: 'COMPLETED',
            statusCode: res.statusCode,
            responseBody: JSON.stringify(captured),
          },
        })
        .catch(() => {
          /* response already sent; nothing actionable */
        });
    } else {
      void prisma.idempotencyKey.delete({ where: { key } }).catch(() => {
        /* already gone / DB error — ignore */
      });
    }
  });

  next();
};
