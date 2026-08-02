import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { isBelow } from '../utils/version';

/**
 * Force-update gate. Native clients send `X-App-Version`; if it is older than
 * APP_MIN_VERSION the request is rejected with 426 so the app can show a
 * blocking "please update" screen. Requests without the header (e.g. the web
 * app, or the /version probe itself) pass through untouched.
 */
export const versionGate = (req: Request, res: Response, next: NextFunction): void => {
  const clientVersion = req.header('X-App-Version');
  if (clientVersion && isBelow(clientVersion, env.APP_MIN_VERSION)) {
    res.status(426).json({
      success: false,
      message: 'Versi aplikasi sudah tidak didukung. Silakan perbarui.',
      error: 'UPGRADE_REQUIRED',
      data: {
        minVersion: env.APP_MIN_VERSION,
        latestVersion: env.APP_LATEST_VERSION,
        updateUrl: {
          android: env.APP_UPDATE_URL_ANDROID,
          ios: env.APP_UPDATE_URL_IOS,
        },
      },
    });
    return;
  }
  next();
};
