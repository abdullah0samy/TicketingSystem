import express from 'express';
import type { Response } from 'express';
import prisma from '../../core/db.ts';
import { authenticate, authorize } from '../../core/middleware/auth.middleware.ts';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { EXPORTS_DIR } from '../../core/paths.ts';

const router = express.Router();

// Helper to get base ticket filter depending on role
const getBaseTicketFilter = (req: any) => {
  const { role, id, departmentId } = req.user;
  if (role === 'super_admin') return {};
  if (role === 'agent' || role === 'supervisor') {
    return {
      OR: [
        { departmentId: departmentId || -1 },
        { assignedToId: id },
        { createdById: id }
      ]
    };
  }
  return { createdById: id }; // end_user
};

// [OPTIMIZATION] Consolidated dashboard summary to prevent request flooding
router.get('/dashboard-summary', authenticate, async (req: any, res) => {
  try {
    const baseWhere = getBaseTicketFilter(req);
    const [
      totalTickets,
      pendingTickets,
      resolvedTickets,
      openTickets,
      overdueTickets,
      statusStats,
      priorityStats,
      depts,
      activity,
      agents,
      exportHistoryItems,
      assets,
      slaBreached
    ] = await Promise.all([
      prisma.ticket.count({ where: baseWhere }),
      prisma.ticket.count({ where: { ...baseWhere, status: 'pending' } }),
      prisma.ticket.count({ where: { ...baseWhere, status: 'resolved' } }),
      prisma.ticket.count({ where: { ...baseWhere, status: 'open' } }),
      prisma.ticket.count({
        where: {
          ...baseWhere,
          status: { notIn: ['resolved', 'closed'] },
          slaDeadline: { lt: new Date() }
        }
      }),
      prisma.ticket.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['priority'], where: baseWhere, _count: { _all: true } }),
      // end_user does not need department stats
      req.user.role === 'end_user' ? Promise.resolve([]) : prisma.department.findMany({
        where: { deletedAt: null },
        include: { _count: { select: { ticketsIn: true } } }
      }),
      req.user.role !== 'super_admin' ? Promise.resolve([]) : prisma.auditLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { fullNameAr: true, fullNameEn: true, avatarUrl: true } } }
      }),
      // Only load agents if supervisor/admin
      ['super_admin', 'supervisor'].includes(req.user.role) ? prisma.user.findMany({
        where: { role: { in: ['agent', 'supervisor'] }, deletedAt: null },
        select: {
          id: true, fullNameEn: true, fullNameAr: true,
          department: { select: { nameEn: true, nameAr: true } },
          ticketsAssigned: {
            where: { status: { in: ['resolved', 'closed'] } }, // Only fetch what's needed for metrics
            select: { status: true, createdAt: true, completedAt: true, slaDeadline: true, firstResponseAt: true }
          }
        }
      }) : Promise.resolve([]),
      prisma.exportHistory.findMany({
        where: { exportedById: req.user.role === 'super_admin' ? undefined : req.user.id },
        orderBy: { createdAt: 'desc' },
        include: { exportedBy: { select: { fullNameAr: true, fullNameEn: true } } }
      }),
      prisma.asset.findMany({}),
      prisma.ticket.count({
        where: { ...baseWhere, slaBreachSent: true }
      })
    ]);

    // Average resolution time - scoped to user's department/role
    const resolvedTicketsForAvg = await prisma.ticket.findMany({
      where: { ...baseWhere, completedAt: { not: null }, status: { in: ['resolved', 'closed'] } },
      select: { createdAt: true, completedAt: true }
    });
    let avgResolutionTimeHours = 0;
    if (resolvedTicketsForAvg.length > 0) {
      const totalMs = resolvedTicketsForAvg.reduce((acc, t) => {
        return acc + (t.completedAt!.getTime() - t.createdAt.getTime());
      }, 0);
      avgResolutionTimeHours = (totalMs / resolvedTicketsForAvg.length) / (1000 * 60 * 60);
    }

    // Process agent performance
    const agentPerformance = agents.map(agent => {
      const resolved = agent.ticketsAssigned; // Already filtered by status in query
      const totalRes = resolved.length;
      let resTime = 0, respTime = 0, respCount = 0, slaCount = 0;
      resolved.forEach(t => {
        if (t.completedAt) {
          resTime += t.completedAt.getTime() - t.createdAt.getTime();
          if (t.slaDeadline && t.completedAt <= t.slaDeadline) slaCount++;
        }
        if (t.firstResponseAt) { respTime += t.firstResponseAt.getTime() - t.createdAt.getTime(); respCount++; }
      });
      return {
        id: agent.id, nameEn: agent.fullNameEn, nameAr: agent.fullNameAr,
        department: agent.department?.nameEn, resolvedCount: totalRes,
        avgResolutionTimeHours: totalRes > 0 ? Math.round((resTime / totalRes) / (3600000) * 10) / 10 : 0,
        avgResponseTimeHours: respCount > 0 ? Math.round((respTime / respCount) / (3600000) * 10) / 10 : 0,
        slaAdherenceRate: totalRes > 0 ? Math.round((slaCount / totalRes) * 100) : null
      };
    });

      // Resolution type breakdown
      const resolvedInternal = await prisma.ticket.count({
        where: { ...baseWhere, status: { in: ['resolved', 'closed'] }, requiresExternalResource: false }
      });
      const resolvedExternal = await prisma.ticket.count({
        where: { ...baseWhere, status: { in: ['resolved', 'closed'] }, requiresExternalResource: true }
      });

      res.json({
          stats: {
            total: totalTickets, pending: pendingTickets, resolved: resolvedTickets,
            open: openTickets, overdue: overdueTickets,
            slaBreaches: slaBreached,
            avgResolutionTimeHours: Math.round(avgResolutionTimeHours * 10) / 10,
            resolvedInternal, resolvedExternal
          },
      statusDistribution: statusStats.map(s => ({ status: s.status, count: s._count._all })),
      priorityDistribution: priorityStats.map(s => ({ priority: s.priority, count: s._count._all })),
      departmentPerformance: depts.map(d => ({ nameAr: d.nameAr || '', nameEn: d.nameEn || '', count: d._count?.ticketsIn || 0 })),
      recentActivity: activity.map(a => ({ ...a, id: a.id.toString() })),
      agentPerformance: agentPerformance,
      exportHistory: exportHistoryItems,
      assetSummary: {
        total: assets.length,
        active: assets.filter((a: any) => a.status === 'active').length,
        maintenance: assets.filter((a: any) => a.status === 'maintenance').length,
        retired: assets.filter((a: any) => a.status === 'retired').length,
      }
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ message: 'Error fetching dashboard summary' });
  }
});

// Get general statistics
router.get('/stats', authenticate, async (req: any, res) => {
  try {
    const baseWhere = getBaseTicketFilter(req);
    const totalTickets = await prisma.ticket.count({ where: baseWhere });
    const pendingTickets = await prisma.ticket.count({ where: { ...baseWhere, status: 'pending' } });
    const resolvedTickets = await prisma.ticket.count({ where: { ...baseWhere, status: 'resolved' } });
    const openTickets = await prisma.ticket.count({ where: { ...baseWhere, status: 'open' } });
    
    // SLA Performance
    const overdueTickets = await prisma.ticket.count({
      where: {
        ...baseWhere,
        status: { notIn: ['resolved', 'closed'] },
        slaDeadline: { lt: new Date() }
      }
    });

    const resolvedWithTimes = await prisma.ticket.findMany({
      where: { ...baseWhere, completedAt: { not: null } },
      select: { createdAt: true, completedAt: true }
    });

    let avgResolutionTimeHours = 0;
    if (resolvedWithTimes.length > 0) {
      const totalMs = resolvedWithTimes.reduce((acc, t) => {
        return acc + (t.completedAt!.getTime() - t.createdAt.getTime());
      }, 0);
      avgResolutionTimeHours = (totalMs / resolvedWithTimes.length) / (1000 * 60 * 60);
    }

    res.json({
      total: totalTickets,
      pending: pendingTickets,
      resolved: resolvedTickets,
      open: openTickets,
      overdue: overdueTickets,
      avgResolutionTimeHours: Math.round(avgResolutionTimeHours * 10) / 10
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats' });
  }
});

// Export Tickets to Excel
router.get('/export', authenticate as any, async (req: any, res: Response) => {
  const { startDate, endDate } = req.query;
  const MAX_EXPORT_ROWS = 10000;

  try {
    const where: any = getBaseTicketFilter(req);
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const totalCount = await prisma.ticket.count({ where });
    if (totalCount > MAX_EXPORT_ROWS) {
      return res.status(400).json({
        message: `Export limited to ${MAX_EXPORT_ROWS} tickets. Please narrow your date range. Found ${totalCount} tickets.`,
        code: 'EXPORT_LIMIT_EXCEEDED'
      });
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        department: true,
        ticketType: true,
        createdBy: { select: { fullNameEn: true, email: true } },
        assignedTo: { select: { fullNameEn: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Tickets');

    worksheet.columns = [
      { header: 'Ticket #', key: 'ticketNumber', width: 15 },
      { header: 'Subject', key: 'subject', width: 30 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Priority', key: 'priority', width: 15 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Type', key: 'type', width: 20 },
      { header: 'Creator', key: 'creator', width: 25 },
      { header: 'Assigned To', key: 'assignedTo', width: 25 },
      { header: 'Created At', key: 'createdAt', width: 20 },
      { header: 'SLA Deadline', key: 'slaDeadline', width: 20 }
    ];

    tickets.forEach(t => {
      worksheet.addRow({
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        department: t.department?.nameEn || 'N/A',
        type: t.ticketType?.nameEn || 'N/A',
        creator: t.createdBy?.fullNameEn || t.creatorName,
        assignedTo: t.assignedTo?.fullNameEn || 'Unassigned',
        createdAt: t.createdAt.toISOString(),
        slaDeadline: t.slaDeadline ? t.slaDeadline.toISOString() : 'N/A'
      });
    });

    // Save to file for history
    if (!fs.existsSync(EXPORTS_DIR)) {
      fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    }

    const fileName = `tickets_report_${Date.now()}.xlsx`;
    const filePath = path.join(EXPORTS_DIR, fileName);
    await workbook.xlsx.writeFile(filePath);

    // Create Export History record
    await prisma.exportHistory.create({
      data: {
        exportedById: req.user.id,
        departmentId: req.user.departmentId || null,
        dateFrom: startDate ? new Date(startDate as string) : new Date(0),
        dateTo: endDate ? new Date(endDate as string) : new Date(),
        fileName: fileName,
        fileUrl: `/uploads/exports/${fileName}`,
        ticketCount: tickets.length,
        expiresAt: new Date(new Date().setHours(27, 0, 0, 0)) // Approx 3 AM next day
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);

    await workbook.xlsx.write(res);
    if (!res.headersSent) res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: 'Error exporting tickets' });
  }
});

// Get Export History
router.get('/exports', authenticate as any, async (req: any, res: Response) => {
  try {
    const exports = await prisma.exportHistory.findMany({
      where: {
        exportedById: req.user.role === 'super_admin' ? undefined : req.user.id
      },
      orderBy: { createdAt: 'desc' },
      include: {
        exportedBy: { select: { fullNameAr: true, fullNameEn: true } }
      }
    });
    res.json(exports);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching export history' });
  }
});

// Status distribution
router.get('/status-distribution', authenticate, async (req: any, res) => {
  try {
    const baseWhere = getBaseTicketFilter(req);
    const stats = await prisma.ticket.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { _all: true }
    });
    res.json(stats.map(s => ({ status: s.status, count: s._count._all })));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching status distribution' });
  }
});

// Priority distribution
router.get('/priority-distribution', authenticate, async (req: any, res) => {
  try {
    const baseWhere = getBaseTicketFilter(req);
    const stats = await prisma.ticket.groupBy({
      by: ['priority'],
      where: baseWhere,
      _count: { _all: true }
    });
    res.json(stats.map(s => ({ priority: s.priority, count: s._count._all })));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching priority distribution' });
  }
});

// Department performance
router.get('/department-performance', authenticate, authorize(['super_admin', 'supervisor']), async (req, res) => {
  try {
    const depts = await prisma.department.findMany({
      where: { deletedAt: null },
      include: {
        _count: {
          select: { ticketsIn: true }
        }
      }
    });
    res.json(depts.map(d => ({ 
      nameAr: d.nameAr, 
      nameEn: d.nameEn, 
      count: d._count.ticketsIn 
    })));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching department performance' });
  }
});

// Recent activity
router.get('/recent-activity', authenticate, authorize(['super_admin']), async (req, res) => {
  try {
    const activity = await prisma.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { fullNameAr: true, fullNameEn: true, avatarUrl: true }
        }
      }
    });
    res.json(activity.map(a => ({
      ...a,
      id: a.id.toString()
    })));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching recent activity' });
  }
});

// Agent performance
router.get('/agent-performance', authenticate, authorize(['super_admin', 'supervisor']), async (req, res) => {
  try {
    const agents = await prisma.user.findMany({
      where: { 
        role: { in: ['agent', 'supervisor'] },
        deletedAt: null
      },
      select: {
        id: true,
        fullNameEn: true,
        fullNameAr: true,
        department: { select: { nameEn: true, nameAr: true } },
        ticketsAssigned: {
          select: {
            status: true,
            createdAt: true,
            completedAt: true,
            slaDeadline: true,
            firstResponseAt: true
          }
        }
      }
    });

    const performance = agents.map(agent => {
      const resolvedTickets = agent.ticketsAssigned.filter(t => t.status === 'resolved' || t.status === 'closed');
      const totalResolved = resolvedTickets.length;
      
      let totalResolutionTimeMs = 0;
      let totalResponseTimeMs = 0;
      let responseCount = 0;
      let slaAdherenceCount = 0;

      resolvedTickets.forEach(t => {
        if (t.completedAt) {
          totalResolutionTimeMs += t.completedAt.getTime() - t.createdAt.getTime();
          if (t.slaDeadline && t.completedAt <= t.slaDeadline) {
            slaAdherenceCount++;
          }
        }
        if (t.firstResponseAt) {
          totalResponseTimeMs += t.firstResponseAt.getTime() - t.createdAt.getTime();
          responseCount++;
        }
      });

      const avgResolutionTimeHours = totalResolved > 0 
        ? (totalResolutionTimeMs / totalResolved) / (1000 * 60 * 60) 
        : 0;
      
      const avgResponseTimeHours = responseCount > 0
        ? (totalResponseTimeMs / responseCount) / (1000 * 60 * 60)
        : 0;
      
      const slaAdherenceRate = totalResolved > 0 
        ? (slaAdherenceCount / totalResolved) * 100 
        : null;

      return {
        id: agent.id,
        nameEn: agent.fullNameEn,
        nameAr: agent.fullNameAr,
        department: agent.department?.nameEn,
        resolvedCount: totalResolved,
        avgResolutionTimeHours: Math.round(avgResolutionTimeHours * 10) / 10,
        avgResponseTimeHours: Math.round(avgResponseTimeHours * 10) / 10,
        slaAdherenceRate: Math.round(slaAdherenceRate)
      };
    });

    res.json(performance);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching agent performance' });
  }
});

// --- AHT (Average Handling Time) Metrics ---
router.get('/aht', authenticate, async (req: any, res) => {
  try {
    const baseWhere = getBaseTicketFilter(req);

    // Overall AHT (all resolved/closed tickets)
    const resolvedTickets = await prisma.ticket.findMany({
      where: { ...baseWhere, completedAt: { not: null }, status: { in: ['resolved', 'closed'] } },
      select: { createdAt: true, completedAt: true, status: true, priority: true, departmentId: true }
    });

    let overallAhtHours = 0;
    if (resolvedTickets.length > 0) {
      const totalMs = resolvedTickets.reduce((acc, t) => acc + (t.completedAt!.getTime() - t.createdAt.getTime()), 0);
      overallAhtHours = (totalMs / resolvedTickets.length) / (1000 * 60 * 60);
    }

    // AHT by priority
    const priorityGroups: Record<string, { total: number; count: number }> = {};
    resolvedTickets.forEach(t => {
      if (!priorityGroups[t.priority]) priorityGroups[t.priority] = { total: 0, count: 0 };
      priorityGroups[t.priority].total += t.completedAt!.getTime() - t.createdAt.getTime();
      priorityGroups[t.priority].count++;
    });
    const ahtByPriority = Object.entries(priorityGroups).map(([priority, data]) => ({
      priority,
      avgHours: Math.round((data.total / data.count) / (3600000) * 10) / 10,
      count: data.count
    }));

    // AHT by department (super_admin only)
    let ahtByDepartment: any[] = [];
    if (req.user.role === 'super_admin') {
      const deptGroups: Record<number, { total: number; count: number }> = {};
      resolvedTickets.forEach(t => {
        if (!deptGroups[t.departmentId]) deptGroups[t.departmentId] = { total: 0, count: 0 };
        deptGroups[t.departmentId].total += t.completedAt!.getTime() - t.createdAt.getTime();
        deptGroups[t.departmentId].count++;
      });
      const deptIds = Object.keys(deptGroups).map(Number);
      const depts = await prisma.department.findMany({ where: { id: { in: deptIds } } });
      const deptMap = new Map(depts.map(d => [d.id, d]));
      ahtByDepartment = Object.entries(deptGroups).map(([deptId, data]) => ({
        departmentId: Number(deptId),
        departmentName: deptMap.get(Number(deptId))?.nameEn || 'Unknown',
        avgHours: Math.round((data.total / data.count) / (3600000) * 10) / 10,
        count: data.count
      }));
    }

    res.json({
      overallAhtHours: Math.round(overallAhtHours * 10) / 10,
      totalResolved: resolvedTickets.length,
      ahtByPriority,
      ahtByDepartment
    });
  } catch (error) {
    console.error('AHT error:', error);
    res.status(500).json({ message: 'Error fetching AHT metrics' });
  }
});

export default router;
