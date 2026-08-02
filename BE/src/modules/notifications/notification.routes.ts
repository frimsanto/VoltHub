import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { notificationController } from './notification.controller';
import {
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
} from './notification.validation';

/**
 * Notification Center routes (mounted at /api/v1/notifications).
 *
 * All routes require authentication and operate on the caller's own inbox only
 * (no role gate — every user has notifications). Mutations are scoped by userId
 * in the service, so there is no cross-user exposure.
 */
const router = Router();
router.use(authenticate);

// Unread badge counter (polled by the FE for the bell badge).
router.get('/unread-count', notificationController.unreadCount);

// Paginated notification history / drawer feed.
router.get('/', validate(listNotificationsQuerySchema, 'query'), notificationController.list);

// Mark all as read.
router.post('/read-all', notificationController.markAllRead);

// Mark a single notification as read.
router.post(
  '/:id/read',
  validate(notificationIdParamsSchema, 'params'),
  notificationController.markRead
);

export default router;
