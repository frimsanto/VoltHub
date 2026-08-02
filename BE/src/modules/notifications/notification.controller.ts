import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { UnauthorizedError } from '../../utils/appError';
import { notificationService } from './notification.service';
import type { ListNotificationsQuery } from './notification.validation';

/**
 * Notification Controller — the authenticated user's own inbox. Every endpoint
 * is scoped to `req.user.userId`; there is no cross-user access (a user can only
 * read and mutate their own notifications).
 */
export class NotificationController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = requireUser(req);
      const { page, limit, unreadOnly } = req.query as unknown as ListNotificationsQuery;
      const { data, meta } = await notificationService.list(userId, page, limit, unreadOnly);
      successResponse(res, data, 'Notifications retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  unreadCount = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = requireUser(req);
      const unread = await notificationService.unreadCount(userId);
      successResponse(res, { unread }, 'Unread count retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  markRead = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = requireUser(req);
      const updated = await notificationService.markRead(userId, req.params.id);
      successResponse(res, { updated }, updated ? 'Marked as read' : 'Already read or not found');
    } catch (err) {
      next(err);
    }
  };

  markAllRead = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = requireUser(req);
      const updated = await notificationService.markAllRead(userId);
      successResponse(res, { updated }, 'All notifications marked as read');
    } catch (err) {
      next(err);
    }
  };
}

const requireUser = (req: AuthRequest): string => {
  const userId = req.user?.userId;
  if (!userId) throw new UnauthorizedError('Authentication required');
  return userId;
};

export const notificationController = new NotificationController();
