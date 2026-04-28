import { Router } from 'express';
import prisma from '../../core/db.ts';
import { authenticate, authorize } from '../../core/middleware/auth.middleware.ts';

const router = Router();

// Get all audit logs with filters
router.get('/', authenticate, authorize(['super_admin']), async (req, res) => {
  try {
    const { 
      userId, 
      action, 
      departmentId, 
      startDate, 
      endDate, 
      ticketId,
      page = 1,
      limit = 20
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = {};

    if (userId) where.userId = Number(userId);
    if (action) where.action = action as string;
    if (departmentId) where.departmentId = Number(departmentId);
    if (ticketId) where.ticketId = Number(ticketId);
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { fullNameAr: true, fullNameEn: true, username: true, badgeNumber: true }
          },
          department: {
            select: { nameAr: true, nameEn: true }
          },
          ticket: {
            select: { ticketNumber: true, subject: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({
      logs,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get audit actions list (for filtering)
router.get('/actions', authenticate, authorize(['super_admin']), async (req, res) => {
  try {
    const actions = await prisma.auditLog.groupBy({
      by: ['action'],
    });
    res.json(actions.map(a => a.action));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch actions' });
  }
});

export default router;
