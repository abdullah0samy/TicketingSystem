import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../core/middleware/auth.middleware.ts';
import { UPLOADS_DIR } from '../../core/paths.ts';

const MAGIC_BYTES: Record<string, (buf: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47,
  'application/pdf': (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  'application/msword': (b) => b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) => b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04,
  'application/vnd.ms-excel': (b) => b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (b) => b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04,
  'audio/wav': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46,
  'audio/mpeg': (b) => (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0),
  'audio/webm': (b) => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3,
};

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

  const validateMagic = MAGIC_BYTES[req.file.mimetype];
  if (validateMagic) {
    const buf = Buffer.alloc(8);
    const fd = fs.openSync(req.file.path, 'r');
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    if (!validateMagic(buf)) {
      fs.unlinkSync(req.file.path);
      return res.status(422).json({ message: 'File content does not match declared MIME type' });
    }
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
