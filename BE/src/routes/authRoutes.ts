import { Router } from 'express';
import { login, logout, logoutAll, refreshToken, getProfile, updateProfile, uploadAvatarHandler, changePassword } from '../controllers/authController';
import { authenticate } from '../middlewares/auth';
import { authLimiter } from '../middlewares/rateLimit';
import { uploadAvatar } from '../middlewares/avatarUpload';

const router = Router();

// Public routes — IP-based rate limit on top of the per-account login lock.
router.post('/login', authLimiter, login);
router.post('/refresh', authLimiter, refreshToken);

// Protected routes
router.post('/logout', authenticate, logout);          // single device
router.post('/logout-all', authenticate, logoutAll);   // every device
router.get('/profile', authenticate, getProfile);
router.patch('/profile', authenticate, updateProfile);
router.post('/avatar', authenticate, uploadAvatar, uploadAvatarHandler);
router.post('/change-password', authenticate, changePassword);

export default router;
