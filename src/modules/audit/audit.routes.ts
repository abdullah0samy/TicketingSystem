import { Router } from 'express';
import prisma from '../../core/db.ts';
import { authenticate, type AuthRequest } from '../../core/middleware/auth.middleware.ts';
import { getUserPermission } from '../../core/permissions.ts';

const router = Router();

const MAX_PAGE_SIZE = 100;

// Get all audit logs with filters
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const hasPerm = await getUserPermission(req.user.id, req.user.role, req.user.departmentId ?? null, 'canViewAuditLogs');
    if (!hasPerm) return res.status(403).json({ message: 'Insufficient permissions' });

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

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(Math.max(1, Number(limit)), MAX_PAGE_SIZE);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (userId) where.userId = Number(userId);
    if (action) where.action = action as string;
    if (departmentId) where.departmentId = Number(departmentId);
    if (ticketId) where.ticketId = Number(ticketId);
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
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
        take: limitNum
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({
      logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get audit actions list (for filtering)
router.get('/actions', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const hasPerm = await getUserPermission(req.user.id, req.user.role, req.user.departmentId ?? null, 'canViewAuditLogs');
    if (!hasPerm) return res.status(403).json({ message: 'Insufficient permissions' });
    const actions = await prisma.auditLog.groupBy({
      by: ['action'],
    });
    res.json(actions.map(a => a.action));
  } catch (error) {
    console.error('Error fetching actions:', error);
    res.status(500).json({ error: 'Failed to fetch actions' });
  }
});

export default router;
