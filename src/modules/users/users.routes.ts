import express from 'express';
import { authenticate, type AuthRequest } from '../../core/middleware/auth.middleware.ts';
import prisma from '../../core/db.ts';
import { AVATARS_DIR } from '../../core/paths.ts';
import { uploadAvatar } from '../../core/middleware/upload.middleware.ts';
import { validateAvatarFile, safeDeleteFile } from '../../core/middleware/fileValidation.middleware.ts';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const router = express.Router();

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { 
        department: {
          include: { defaultPermissions: true }
        },
        permissionsOverride: true
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      id: user.id,
      badgeNumber: user.badgeNumber,
      username: user.username,
      fullNameAr: user.fullNameAr,
      fullNameEn: user.fullNameEn,
      role: user.role,
      department: user.department,
      langPref: user.langPref,
      avatarUrl: user.avatarUrl
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/avatar', authenticate, uploadAvatar.single('avatar'), async (req: AuthRequest, res) => {
  if (!req.file || !req.user) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const originalPath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    await validateAvatarFile(originalPath, ext);

    const resizedFilename = `resized-${req.file.filename}`;
    const resizedPath = path.join(AVATARS_DIR, resizedFilename);

    // Resize image to 200x200
    await sharp(originalPath)
      .resize(200, 200, { fit: 'cover' })
      .toFile(resizedPath);

    // Delete original file
    fs.unlinkSync(originalPath);

    const avatarUrl = `/uploads/avatars/${resizedFilename}`;

    // Update user in DB
    await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl }
    });

    res.json({
      message: 'Avatar updated successfully',
      avatarUrl
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/profile', authenticate, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

  const { fullNameAr, fullNameEn, email, langPref } = req.body;

  if (!fullNameAr) {
    return res.status(400).json({ message: 'Arabic name is required' });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        fullNameAr,
        fullNameEn,
        email,
        langPref
      },
      include: {
        department: {
          include: { defaultPermissions: true }
        },
        permissionsOverride: true
      }
    });

    // BUG FIX: Exclude passwordHash from response to prevent credential leakage
    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile' });
  }
});

export default router;
