# VoltHub — Real-Time Notification System

Status: **Implemented** · Scope: backend service + queue + retry + history, web
notification center, mobile push integration · Migration: **additive** (no
existing table altered).

The notification system delivers in-app and push notifications for seven
lifecycle events across the VoltHub domain. It is built **on top of the existing
device-token / FCM infrastructure** (`device_tokens` + `pushService`) and adds a
durable per-user inbox plus an in-process delivery queue with retry.

---

## 1. Trigger Events

| Event                | `NotificationType`    | Fired from                                  | Default recipient(s)                |
| -------------------- | --------------------- | ------------------------------------------- | ----------------------------------- |
| New task assigned    | `TASK_ASSIGNED`       | `ticket.service.assign` / `create` (w/ assignee) | the assignee                   |
| Report submitted     | `REPORT_SUBMITTED`    | `workflow.service.performAction` (`SUBMIT`) | admin / reviewer pool               |
| Report approved      | `REPORT_APPROVED`     | `workflow…performAction` (`APPROVE`)        | report owner (instance `createdBy`) |
| Report rejected      | `REPORT_REJECTED`     | `workflow…performAction` (`REJECT`)         | report owner                        |
| Revision requested   | `REVISION_REQUESTED`  | `workflow…performAction` (`REQUEST_REVISION`) | report owner                      |
| Ticket created       | `TICKET_CREATED`      | `ticket.service.create`                     | assignee, else admin triage pool    |
| Ticket closed        | `TICKET_CLOSED`       | `ticket.service.close`                      | assignee, else admin pool           |

The actor who performed the action is always excluded from the recipients (you
don't get notified about your own action).

---

## 2. Architecture

```
 Domain service (ticket / workflow)
        │  (best-effort, non-blocking)
        ▼
 notification.dispatcher        ← resolves recipients per event
        │
        ▼
 notification.service.notify()  ← renders copy (events catalog), de-dupes,
        │                          writes 1 inbox row per recipient
        ├──────────────► notifications            (in-app inbox + history + read state)
        │
        └──────────────► notification_deliveries  (PENDING push job)
                                 │
                                 ▼  polled every 10s
                         notification.queue (worker)
                                 │  claim → send → SENT | retry(backoff) | DEAD
                                 ▼
                         pushService.sendToUserResult → FCM → device_tokens
```

Two tables intentionally separate **what** from **how**:

- **`notifications`** — one row per recipient. This *is* the in-app inbox, the
  history, and the read-state. Created **synchronously** inside the triggering
  request (best-effort).
- **`notification_deliveries`** — one row per (notification, channel) push
  attempt-set. Drained **asynchronously** by the queue worker. Holds the retry
  bookkeeping (`attempts`, `maxAttempts`, `nextAttemptAt`, `status`, `lastError`).

### Why no Redis/BullMQ?

The queue is a dependency-free, in-process poller — consistent with the rest of
the stack (the app already runs a single Node process against MySQL, with no
broker). It is durable (state lives in MySQL, survives restarts), self-healing
(reclaims rows stuck in `PROCESSING` after a crash), and idempotent at the row
level. If the deployment later scales horizontally, the claim step
(`PENDING → PROCESSING` via a guarded `updateMany`) is the seam to swap for a
`SELECT … FOR UPDATE SKIP LOCKED` or a real broker.

---

## 3. Data Model

`prisma/migrations/20260605120000_notification_system_additive/migration.sql`

### `notifications`
| column       | type                                  | notes                                            |
| ------------ | ------------------------------------- | ------------------------------------------------ |
| `id`         | varchar(36) PK                        | uuid                                             |
| `userId`     | varchar(36) FK → users (CASCADE)      | recipient                                        |
| `type`       | enum `NotificationType`               | the 7 events                                     |
| `title`/`body` | varchar(255) / text                 | rendered copy (Indonesian)                       |
| `entityType`/`entityId` | varchar / varchar          | source entity for deep-linking                   |
| `data`       | longtext (JSON)                       | mirrored into the FCM `data` payload             |
| `dedupeKey`  | varchar(255)                          | **idempotency** — unique per `(userId, dedupeKey)` |
| `readAt`     | datetime, nullable                    | null = unread                                    |
| `createdAt`  | datetime                              |                                                  |

Indexes: `(userId)`, `(userId, readAt)` (unread counter), `(createdAt)`,
unique `(userId, dedupeKey)`.

### `notification_deliveries`
| column          | type                                       | notes                                  |
| --------------- | ------------------------------------------ | -------------------------------------- |
| `id`            | varchar(36) PK                             |                                        |
| `notificationId`| varchar(36) FK → notifications (CASCADE)   |                                        |
| `channel`       | varchar(20), default `PUSH`                | future: EMAIL / SMS                    |
| `status`        | enum `PENDING/PROCESSING/SENT/FAILED/DEAD` |                                        |
| `attempts`      | int, default 0                             |                                        |
| `maxAttempts`   | int, default 5                             |                                        |
| `lastError`     | text                                       | last transport error                   |
| `nextAttemptAt` | datetime                                   | retry schedule (backoff)               |
| `sentAt`        | datetime, nullable                         |                                        |

Index: `(status, nextAttemptAt)` (the "due work" query).

---

## 4. Duplicate Prevention

Required by the task. Enforced at the database layer:

- Every notification carries a deterministic `dedupeKey` built from
  `type : entityType : entityId : discriminator`.
- The `(userId, dedupeKey)` **unique index** means the same logical event for the
  same recipient can only ever produce one row.
- `repository.createIfNew` inserts and swallows the `P2002` unique violation,
  returning `null` (an idempotent no-op) — so a retried trigger, a double-submit,
  or an at-least-once delivery upstream never produces a duplicate, and no push
  is enqueued for the duplicate either.
- The **discriminator** keeps legitimately-distinct events distinct: workflow
  events use the unique `transitionId`, so re-approving after a revision is a new
  notification, while a retried single transition is deduped.

---

## 5. Queue Processing & Retry

`src/modules/notifications/notification.queue.ts`

- **Poll**: every `intervalMs` (default 10s) the worker claims up to `batchSize`
  (25) due deliveries (`status = PENDING AND nextAttemptAt <= now`).
- **Claim**: `PENDING → PROCESSING` via a guarded `updateMany` so a delivery is
  processed once even if two ticks overlap (there is also an in-process
  re-entrancy guard).
- **Send**: `pushService.sendToUserResult(userId, payload)` →
  - `sent` or `skipped` (push disabled / user has no devices) → mark **`SENT`**
    (terminal; "delivered to the channel as configured").
  - thrown transport/HTTP error → record the attempt and **retry**.
- **Retry / backoff**: exponential — `30s · 2^(attempt-1)`, capped at 30 min:
  `30s → 60s → 120s → 240s → 480s`. After `maxAttempts` (5) the row becomes
  **`DEAD`** (dead-letter; inspectable via `lastError`).
- **Self-healing**: rows stuck in `PROCESSING` longer than `staleMs` (2 min, e.g.
  a crash mid-tick) are reclaimed to `PENDING` at the start of each tick.
- **Lifecycle**: started from `src/index.ts` after `app.listen`; stopped on
  `SIGTERM`/`SIGINT`.

`tick()` is exported and returns `{ processed, sent, failed }` so it can be
driven synchronously from tests or a manual flush.

---

## 6. Notification History

The `notifications` table is the durable history. The API exposes it per-user:

| Method & path                          | Purpose                                   |
| -------------------------------------- | ----------------------------------------- |
| `GET  /api/v1/notifications`           | paginated feed; `meta.unread` included; `?unreadOnly=true` |
| `GET  /api/v1/notifications/unread-count` | `{ unread }` — drives the bell badge   |
| `POST /api/v1/notifications/:id/read`  | mark one as read (scoped to owner)        |
| `POST /api/v1/notifications/read-all`  | mark all as read                          |

All endpoints require auth and are **scoped to `req.user.userId`** — there is no
cross-user read or write. Documented in Swagger (`/api/docs`, tag *Notifications*).

---

## 7. Frontend — Notification Center

- **API layer**: `FE/src/features/v2/notifications/api.ts` — typed client +
  React Query hooks (`useUnreadCount`, `useNotifications`, `useMarkRead`,
  `useMarkAllRead`).
- **Unread counter**: `useUnreadCount` polls `/unread-count` every 30s (and on
  window focus) → red badge on the bell.
- **Notification drawer / center**: `FE/src/components/NotificationCenter.tsx` —
  a slide-over `Sheet` listing notifications with a per-type icon, unread accent,
  relative timestamps, **mark-as-read** on click + inline check button, and
  **mark-all-read**. The feed is only fetched while the drawer is open; the badge
  polls continuously. Mounted in `Topbar` (replaces the legacy local-only
  `NotificationDropdown`).
- **Deep-linking**: `FE/src/features/v2/notifications/links.ts`
  (`resolveNotificationLink`) maps a notification to an in-app route
  (`/tickets/:id`, `/laporan-awal|akhir/:id`, fallback `/history`). Shared with
  mobile push so web + native navigate identically.

---

## 8. Mobile — Push Integration

Reuses the **existing** device-token infrastructure (the task's first rule):

- Registration is unchanged: `lib/native/push.ts` (`initPush`) registers the
  FCM/APNs token via `POST /push/register`, which upserts into `device_tokens`.
- The notification queue sends through `pushService` →
  `https://fcm.googleapis.com/fcm/send` using those same tokens, and prunes
  `NotRegistered`/`InvalidRegistration` tokens on send.
- `resolveDeepLink` in `lib/native/push.ts` now recognises the notification-system
  payload shape (`{ type: <EVENT>, entityType, entityId, notificationId }`) and
  routes via the shared `resolveNotificationLink`, in addition to the legacy
  `{ type: 'laporan-awal'|'laporan-akhir', id }` shape.
- Push is **best-effort & optional**: when `FCM_SERVER_KEY` is unset, sends are a
  no-op and deliveries are marked `SENT` (skipped) — the in-app center still works
  fully. Android channel + foreground/background tap handling are already in place.

---

## 9. Files

**Backend** (`BE/src/modules/notifications/`)
- `notification.events.ts` — event → copy templates (+ tests)
- `notification.repository.ts` — persistence, dedupe insert, queue ops, recipient resolution
- `notification.service.ts` — `notify()` fan-out + inbox read API
- `notification.queue.ts` — in-process delivery worker w/ retry/backoff (+ tests)
- `notification.dispatcher.ts` — per-event recipient resolution; the seam called by domain services
- `notification.controller.ts` / `notification.routes.ts` / `notification.validation.ts`

**Backend wiring**
- `prisma/schema.prisma` + migration `20260605120000_notification_system_additive`
- `services/pushService.ts` — added `sendToUserResult` (throwing, result-returning) alongside best-effort `sendToUser`
- `modules/tickets/ticket.service.ts`, `modules/workflow/workflow.service.ts` — trigger calls
- `routes/index.ts` (mount `/v1/notifications`), `index.ts` (start/stop queue), `config/swagger.ts`

**Frontend**
- `features/v2/notifications/api.ts`, `features/v2/notifications/links.ts`
- `components/NotificationCenter.tsx`, `components/Topbar.tsx` (wired)
- `lib/native/push.ts` (extended deep-link resolver)

---

## 10. Operational Notes

- **Configuration**: set `FCM_SERVER_KEY` to enable push; without it the system
  runs fully on the in-app channel.
- **Tuning**: queue cadence/batch/backoff are constructor options on
  `NotificationQueue` (defaults in `DEFAULTS`).
- **Dead letters**: deliveries that exhaust retries are `status = DEAD` with the
  last error in `lastError` — query `notification_deliveries` to inspect/replay.
- **Retention**: `notifications` grows with activity; add a periodic prune (e.g.
  delete read rows older than N days) if needed — out of scope here.
- **Scaling**: see §2 ("Why no Redis") for the horizontal-scale seam.
