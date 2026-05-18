import { Router } from 'express';
import prisma from '../../core/db.ts';
import { authenticate } from '../../core/middleware/auth.middleware.ts';

const router = Router();

// Get notes for the user's department with pagination
router.get('/', authenticate, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { departmentId: true, role: true }
    });

    const where: any = { deletedAt: null };

    if (user?.role !== 'super_admin') {
      if (!user?.departmentId) {
        return res.json({ notes: [], total: 0, page: 1, limit: 50 });
      }
      where.departmentId = user.departmentId;
    }

    const pageNum = Math.max(1, parseInt(req.query.page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [notes, total] = await Promise.all([
      prisma.teamNote.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          author: {
            select: {
              id: true,
              fullNameAr: true,
              fullNameEn: true,
              avatarUrl: true
            }
          },
          attachments: true,
          comments: {
            include: {
              author: {
                select: {
                  id: true,
                  fullNameAr: true,
                  fullNameEn: true,
                  avatarUrl: true
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          },
          likes: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.teamNote.count({ where })
    ]);

    res.json({ notes, total, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error('Error fetching team notes:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create a new note
router.post('/', authenticate, async (req: any, res) => {
  const { body, attachments } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { departmentId: true, role: true }
    });

    if (!user?.departmentId && user?.role !== 'super_admin') {
      return res.status(400).json({ message: 'User not assigned to a department' });
    }

    const note = await prisma.teamNote.create({
      data: {
        body,
        authorId: req.user.id,
        departmentId: user?.departmentId || null, // Allow null for super admins
        attachments: {
          create: attachments?.map((a: any) => ({
            fileName: a.fileName,
            fileUrl: a.fileUrl,
            fileSize: a.fileSize,
            mimeType: a.mimeType,
            isVoiceNote: a.isVoiceNote || false,
            voiceDuration: a.voiceDuration
          }))
        }
      },
      include: {
        author: true,
        attachments: true,
        comments: true,
        likes: true
      }
    });

    res.status(201).json(note);
  } catch (error) {
    console.error('Error creating team note:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add a comment
router.post('/:id/comments', authenticate, async (req: any, res) => {
  const { body } = req.body;
  const noteId = parseInt(req.params.id);

  try {
    const comment = await prisma.teamNoteComment.create({
      data: {
        body,
        authorId: req.user.id,
        noteId
      },
      include: {
        author: {
          select: {
            id: true,
            fullNameAr: true,
            fullNameEn: true,
            avatarUrl: true
          }
        }
      }
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Toggle like
router.post('/:id/like', authenticate, async (req: any, res) => {
  const noteId = parseInt(req.params.id);
  const userId = req.user.id;

  try {
    const existingLike = await prisma.teamNoteLike.findUnique({
      where: {
        noteId_userId: { noteId, userId }
      }
    });

    if (existingLike) {
      await prisma.teamNoteLike.delete({
        where: { id: existingLike.id }
      });
      res.json({ liked: false });
    } else {
      await prisma.teamNoteLike.create({
        data: { noteId, userId }
      });
      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
