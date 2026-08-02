import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';
import { Request } from 'express';
import { safeUploadFilename, isDangerousUploadMime } from '../utils/uploadSecurity';

// Base upload directory
const UPLOAD_BASE_DIR = path.join(process.cwd(), env.UPLOAD_DIR);

// Ensure base directory exists
if (!fs.existsSync(UPLOAD_BASE_DIR)) {
  fs.mkdirSync(UPLOAD_BASE_DIR, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    const jenis = req.params.jenis || 'temp';
    const category = req.body.category || 'DOKUMENTASI_LAIN';
    
    // Determine subfolder
    let subFolder = 'documents';
    if (category.includes('LOGGER')) subFolder = 'logger';
    else if (category.includes('SLD')) subFolder = 'sld';
    else if (file.mimetype.startsWith('image/')) subFolder = 'images';
    
    const destPath = path.join(UPLOAD_BASE_DIR, jenis, subFolder);
    
    // Create directory if not exists
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }
    
    cb(null, destPath);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // Force a whitelisted extension so a spoofed-MIME upload can never be stored
    // with an executable/script extension (.php, .html, .svg, .exe -> .bin).
    cb(null, safeUploadFilename(file.originalname));
  },
});

// File filter based on category
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const category = req.body.category || '';
  const categories = req.body.categories || [];
  const jenis = req.params.jenis;
  
  // Define allowed mime types per category
  const allowedTypes: { [key: string]: string[] } = {
    // Legacy categories (images only)
    'FOTO_SEBELUM': ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    'FOTO_BRIEFING': ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    'FOTO_APD': ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    'FOTO_PEKERJAAN': ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    'FOTO_HASIL': ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    'FOTO_KM_SEBELUM': ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    'FOTO_KM_SESUDAH': ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    // New All-in-One category (images + videos)
    'DOKUMENTASI_ALL': [
      'image/jpeg', 'image/png', 'image/webp', 'image/jpg',
      'video/mp4', 'video/quicktime', 'video/avi', 'video/x-msvideo'
    ],
    // Laporan Akhir categorized uploads
    'LOGGER_FILE': [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX ONLY
    ],
    'SLD_FILE': [
      'image/jpeg', 'image/png', 'image/webp', 'image/jpg',
      'application/pdf'
    ],
    'DOKUMENTASI_HASIL': [
      'image/jpeg', 'image/png', 'image/webp', 'image/jpg',
      'video/mp4', 'video/quicktime', 'video/avi', 'video/x-msvideo'
    ],
    'DOKUMENTASI_LAIN': [
      'image/jpeg', 'image/png', 'image/webp', 'image/jpg',
      'video/mp4', 'video/quicktime', 'video/avi', 'video/x-msvideo',
      'application/pdf', 'text/plain'
    ],
  };
  
  // Hard block on script-carrying types regardless of category/jenis (stored-XSS
  // defence — SVG passes a naive `image/*` check but renders <script>).
  if (isDangerousUploadMime(file.mimetype)) {
    cb(new Error(`File type ${file.mimetype} not allowed`));
    return;
  }

  // If category specified, validate against it
  if (category && allowedTypes[category]) {
    if (allowedTypes[category].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed for category ${category}. Allowed: ${allowedTypes[category].join(', ')}`));
    }
    return;
  }
  
  // Default validation based on jenis
  if (jenis === 'laporan-awal') {
    // Images only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error(`Only image files are allowed for ${jenis}`));
    }
  } else if (jenis === 'laporan-akhir') {
    // Images, logger, SLD
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf',
      'text/plain', 'application/octet-stream'
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.log')) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type for laporan-akhir`));
    }
  } else {
    cb(null, true);
  }
};

// All-in-One Documentation Upload - Supports 50 files, Images + Videos
export const uploadDocumentation = multer({
  storage,
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'image/jpg',
      'video/mp4', 'video/quicktime', 'video/avi', 'video/x-msvideo'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only images (JPG, PNG, WEBP) and videos (MP4, MOV, AVI) are allowed. Got: ${file.mimetype}`));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file (for videos)
    files: 50, // Support up to 50 files
  },
});

// Legacy Multer upload instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_FILE_SIZE || 25 * 1024 * 1024, // 25MB default
    files: env.MAX_FILES_PER_UPLOAD || 20,
  },
});

// Single file upload
export const uploadSingle = upload.single('file');

// Multiple files upload (legacy - 20 files)
export const uploadMultiple = upload.array('files', 20);

// All-in-One multiple files upload (50 files for documentation)
export const uploadAllInOne = uploadDocumentation.array('files', 50);

// Categorized upload for Laporan Akhir - supports 100 files across 3 categories
export const uploadLaporanAkhirCategorized = multer({
  storage,
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Accept the UNION of all allowed types here; the controller performs the
    // authoritative per-file category/mime/size validation. With multipart
    // streaming the per-file `categories[index]` field isn't reliably available
    // at filter time (it arrives after its file), so keying the filter on it
    // wrongly rejects valid files (e.g. XLSX loggers). Keep the filter lenient.
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX logger
      'image/jpeg', 'image/png', 'image/webp', 'image/jpg',
      'application/pdf',
      'video/mp4', 'video/quicktime', 'video/avi', 'video/x-msvideo',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max per file
    files: 100, // Support up to 100 files total
  },
}).array('files', 100);

// Error handler middleware for multer
export const handleUploadError = (err: any, req: Request, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large',
        error: `Maximum file size is 100MB`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files',
        error: `Maximum 100 files allowed`,
      });
    }
    return res.status(400).json({
      success: false,
      message: 'Upload error',
      error: err.message,
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      message: 'File validation failed',
      error: err.message,
    });
  }
  
  next();
};
