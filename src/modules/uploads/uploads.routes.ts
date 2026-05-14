import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../core/middleware/auth.middleware.ts';
import { UPLOADS_DIR } from '../../core/paths.ts';

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// BUG FIX: Regex-based mimetype check fails for complex MIME types like
// application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (xlsx)
// Use explicit allowlists instead.
const ALLOWED_EXTENSIONS = ['.jpeg', '.jpg', '.png', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.wav', '.mp3', '.webm'];
const ALLOWED_MIMETYPES = [
  'image/jpeg', 'image/png',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/wav', 'audio/mpeg', 'audio/webm'
];

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext) && ALLOWED_MIMETYPES.includes(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type. Allowed: JPEG, PNG, PDF, DOC, DOCX, XLS, XLSX, WAV, MP3, WEBM'));
  }
});
router.post('/', authenticate as any, upload.single('file'), (req: any, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    fileName: req.file.originalname,
    fileUrl,
    fileSize: req.file.size,
    mimeType: req.file.mimetype
  });
});

router.get('/download/:filename', authenticate as any, (req, res) => {
  const { filename } = req.params;

  // SECURITY: Sanitize filename to prevent path traversal attacks (e.g. ../../etc/passwd)
  const sanitized = path.basename(filename);
  const filePath = path.resolve(UPLOADS_DIR, uploadDir, sanitized);
  const uploadsRoot = path.resolve(UPLOADS_DIR, uploadDir);

  // Double-check: resolved path must be strictly within the uploads directory
  if (!filePath.startsWith(uploadsRoot + path.sep) && filePath !== uploadsRoot) {
    return res.status(400).json({ message: 'Invalid filename' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found' });
  }

  res.download(filePath, sanitized);
});

export default router;
