import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { successResponse, errorResponse } from '../utils/response';
import { registerDeviceToken, removeDeviceToken } from '../services/pushService';

export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token, platform } = req.body as { token?: string; platform?: string };
    if (!token) {
      errorResponse(res, 'token is required', 400);
      return;
    }
    await registerDeviceToken(req.user!.userId, token, platform);
    successResponse(res, null, 'Device token registered');
  } catch (error) {
    errorResponse(res, error instanceof Error ? error.message : 'Failed to register token', 500);
  }
};

export const unregister = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body as { token?: string };
    if (!token) {
      errorResponse(res, 'token is required', 400);
      return;
    }
    await removeDeviceToken(token);
    successResponse(res, null, 'Device token removed');
  } catch (error) {
    errorResponse(res, error instanceof Error ? error.message : 'Failed to remove token', 500);
  }
};
