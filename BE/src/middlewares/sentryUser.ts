import { Response, NextFunction } from 'express';
import { Sentry, isSentryEnabled } from '../config/sentry';
import { AuthRequest } from './auth';

/**
 * Attaches the authenticated user (id/email/role) to the Sentry scope so
 * captured errors carry "who was affected". Runs after `authenticate`
 * populates `req.user`. No-op when Sentry is disabled.
 */
export const sentryUserContext = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void => {
  if (isSentryEnabled() && req.user) {
    Sentry.setUser({
      id: req.user.userId,
      email: req.user.email,
      // Custom attribute — visible in the Sentry event under user context.
      role: req.user.role,
    });
  }
  next();
};
