import multer from 'multer';
import path from 'path';
import { env } from '../config/env';
import { safeUploadFilename, isDangerousUploadMime } from '../utils/uploadSecurity';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine subdirectory based on file type
    const isImage = file.mimetype.startsWith('image/');
    const dest = isImage 
      ? path.join(env.UPLOAD_DIR, 'images') 
      : path.join(env.UPLOAD_DIR, 'documents');
    
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    // Force a whitelisted extension (defence against executable uploads).
    cb(null, safeUploadFilename(file.originalname));
  },
});

const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
    // Videos
    'video/mp4',
    'video/quicktime', // MOV
    'video/avi',
    'video/x-msvideo',
    // Documents
    'application/pdf',
    'text/plain',
    'application/octet-stream',
  ];

  if (isDangerousUploadMime(file.mimetype)) {
    cb(new Error(`File type ${file.mimetype} not allowed`));
    return;
  }

  if (allowedMimeTypes.includes(file.mimetype) ||
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`));
  }
};

// All-in-One Upload for Documentation - Supports 40+ files, Images + Videos
export const uploadDocumentation = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'image/jpg',
      'video/mp4', 'video/quicktime', 'video/avi', 'video/x-msvideo'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images (JPG, PNG, WEBP) and videos (MP4, MOV, AVI) are allowed'));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file (for videos)
    files: 50, // Support up to 50 files
  },
});

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_FILE_SIZE,
    files: env.MAX_FILES_PER_UPLOAD,
  },
});

// Specific upload configurations
export const uploadImage = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') && !isDangerousUploadMime(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB for images
    files: 20,
  },
});

export const uploadLogger = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['text/plain', 'application/octet-stream'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.log') || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only .log and .txt files are allowed'));
    }
  },
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB for logger files
    files: 1,
  },
});
