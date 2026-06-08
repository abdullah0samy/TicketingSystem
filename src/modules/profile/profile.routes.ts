import { Router } from 'express';
import prisma from '../../core/db.ts';
import { authenticate, type AuthRequest } from '../../core/middleware/auth.middleware.ts';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        badgeNumber: true,
        username: true,
        fullNameAr: true,
        fullNameEn: true,
        email: true,
        role: true,
        avatarUrl: true,
        about: true,
        isActive: true,
        departmentId: true,
        department: { select: { nameAr: true, nameEn: true } },
      }
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { avatarUrl, about } = req.body;
    const data: any = {};
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;
    if (about !== undefined) data.about = about;

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: {
        id: true,
        badgeNumber: true,
        username: true,
        fullNameAr: true,
        fullNameEn: true,
        email: true,
        role: true,
        avatarUrl: true,
        about: true,
        isActive: true,
        departmentId: true,
        department: { select: { nameAr: true, nameEn: true } },
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'PROFILE_UPDATED',
        newData: { avatarUrl, about },
        entityType: 'USER_PROFILE',
        entityId: user.id,
      }
    });

    res.json(user);
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
