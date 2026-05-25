import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../../core/db.ts';
import { authenticate, type AuthRequest } from '../../core/middleware/auth.middleware.ts';
import { checkTicketAccess } from '../../core/middleware/permission.middleware.ts';
import { validateUploadedFile, safeDeleteFile } from '../../core/middleware/fileValidation.middleware.ts';
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

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});
router.post('/', authenticate as any, upload.single('file'), async (req: any, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    const filePath = path.resolve(req.file.destination, req.file.filename);

    const { mimeType } = await validateUploadedFile(filePath, ext);

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      fileName: req.file.originalname,
      fileUrl,
      fileSize: req.file.size,
      mimeType,
    });
  } catch (error) {
    await safeDeleteFile(path.resolve(req.file.destination, req.file.filename));
    next(error);
  }
});

async function checkFileAccess(req: AuthRequest, filename: string): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === 'super_admin') return true;

  // Look up file in ticket attachments
  const ticketAttachment = await prisma.ticketAttachment.findFirst({
    where: { fileUrl: { endsWith: filename } },
    include: { ticket: { select: { id: true, createdById: true, assignedToId: true, departmentId: true } } },
  });
  if (ticketAttachment) {
    return checkTicketAccess(req, ticketAttachment.ticket);
  }

  // Look up file in message attachments
  const messageAttachment = await prisma.messageAttachment.findFirst({
    where: { fileUrl: { endsWith: filename } },
    include: { message: { include: { ticket: { select: { id: true, createdById: true, assignedToId: true, departmentId: true } } } } },
  });
  if (messageAttachment) {
    return checkTicketAccess(req, messageAttachment.message.ticket);
  }

  // Look up file in team note attachments
  const noteAttachment = await prisma.teamNoteAttachment.findFirst({
    where: { fileUrl: { endsWith: filename } },
    include: { note: { select: { departmentId: true } } },
  });
  if (noteAttachment) {
    const userDeptId = req.user.departmentId ? Number(req.user.departmentId) : null;
    return userDeptId !== null && noteAttachment.note.departmentId === userDeptId;
  }

  // File not found in any attachment record — deny access
  return false;
}

router.get('/download/:filename', authenticate as any, async (req: AuthRequest, res) => {
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

  const hasAccess = await checkFileAccess(req, sanitized);
  if (!hasAccess) {
    return res.status(403).json({ message: 'You do not have access to this file' });
  }

  res.download(filePath, sanitized);
});

export default router;
