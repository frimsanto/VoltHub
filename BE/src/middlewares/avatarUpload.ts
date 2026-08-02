import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';
import { safeUploadFilename } from '../utils/uploadSecurity';

// Avatars live in their own folder, served inline (not as an attachment) by a
// dedicated static mount in index.ts. Only raster images are accepted — SVG is
// rejected so an avatar can never carry inline script (stored-XSS defence).
const AVATAR_DIR = path.join(process.cwd(), env.UPLOAD_DIR, 'avatars');
if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

const ALLOWED_AVATAR_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  // Force a whitelisted extension; prefix keeps avatar files easy to spot.
  filename: (_req, file, cb) => cb(null, `avatar-${safeUploadFilename(file.originalname)}`),
});

export const uploadAvatar = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB is plenty for an avatar
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AVATAR_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Foto harus berformat JPG, PNG, atau WEBP'));
    }
  },
}).single('avatar');
