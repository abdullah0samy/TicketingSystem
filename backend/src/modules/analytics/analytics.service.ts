import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EXPORTS_DIR } from '../../core/paths';
import path from 'path';
import fs from 'fs';

function getBaseTicketFilter(userRole: string, userId: number, userDeptId: number | null | undefined): any {
  if (userRole === 'super_admin') return {};
  // F-7: Agents see dept tickets (same as supervisor), not just tickets they created
  if (userRole === 'agent' || userRole === 'supervisor') {
    return { departmentId: userDeptId || -1 };
  }
  return { createdById: userId };
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getDashboardSummary(userRole: string, userId: number, userDeptId: number | null | undefined) {
    const baseWhere = getBaseTicketFilter(userRole, userId, userDeptId);
    const baseWhereArchived = { ...baseWhere, isArchived: false };

    const [total, pending, open, resolved, slaBreachCount, resolvedInternal, resolvedExternal] = await Promise.all([
      this.prisma.ticket.count({ where: baseWhereArchived }),
      this.prisma.ticket.count({ where: { ...baseWhereArchived, status: 'pending' } }),
      this.prisma.ticket.count({ where: { ...baseWhereArchived, status: 'open' } }),
      this.prisma.ticket.count({ where: { ...baseWhereArchived, status: 'resolved' } }),
      this.prisma.ticket.count({ where: { ...baseWhereArchived, status: { notIn: ['resolved', 'closed'] }, slaDeadline: { lt: new Date() } } }),
      this.prisma.ticket.count({ where: { ...baseWhereArchived, status: { in: ['resolved', 'closed'] }, requiresExternalResource: false } }),
      this.prisma.ticket.count({ where: { ...baseWhereArchived, status: { in: ['resolved', 'closed'] }, requiresExternalResource: true } }),
    ]);

    const [statusDistribution, priorityDistribution, departmentPerformanceArr, recentActivity, agentPerformanceArr, exportHistory, assets, resolvedTicketsForAvg] = await Promise.all([
      this.prisma.ticket.groupBy({ by: ['status'], where: baseWhereArchived, _count: { _all: true } }),
      this.prisma.ticket.groupBy({ by: ['priority'], where: baseWhereArchived, _count: { _all: true } }),
      userRole !== 'end_user'
        ? this.prisma.department.findMany({ where: { deletedAt: null }, include: { _count: { select: { ticketsIn: true } } } })
        : Promise.resolve([]),
      userRole === 'super_admin'
        ? this.prisma.auditLog.findMany({ take: 10, orderBy: { createdAt: 'desc' }, include: { user: { select: { fullNameAr: true, fullNameEn: true, avatarUrl: true } } } })
        : Promise.resolve([]),
      (userRole === 'super_admin' || userRole === 'supervisor')
        ? this.prisma.user.findMany({
            where: { role: { in: ['agent', 'supervisor'] }, deletedAt: null },
            select: { id: true, fullNameEn: true, fullNameAr: true, department: { select: { nameEn: true } },
              ticketsAssigned: { where: { status: { in: ['resolved', 'closed'] } }, select: { createdAt: true, completedAt: true, firstResponseAt: true, slaDeadline: true, status: true } } },
          })
        : Promise.resolve([]),
      userRole === 'super_admin'
        ? this.prisma.exportHistory.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { exportedBy: { select: { fullNameAr: true, fullNameEn: true } } } })
        : this.prisma.exportHistory.findMany({ where: { exportedById: userId }, orderBy: { createdAt: 'desc' }, take: 20, include: { exportedBy: { select: { fullNameAr: true, fullNameEn: true } } } }),
      this.prisma.asset.findMany(),
      this.prisma.ticket.findMany({ where: { ...baseWhereArchived, completedAt: { not: null }, status: { in: ['resolved', 'closed'] } }, select: { createdAt: true, completedAt: true, slaDeadline: true } }),
    ]);

    let avgResolutionTimeHours = 0;
    if (resolvedTicketsForAvg.length > 0) {
      const totalMs = resolvedTicketsForAvg.reduce((acc, t) => acc + (t.completedAt!.getTime() - t.createdAt.getTime()), 0);
      avgResolutionTimeHours = Math.round((totalMs / resolvedTicketsForAvg.length) / (1000 * 60 * 60) * 10) / 10;
    }

    const breachedResolved = resolvedTicketsForAvg.filter(t => t.completedAt! > t.slaDeadline!);
    const slaBreaches = slaBreachCount + breachedResolved.length;

    const agentPerformance = agentPerformanceArr.map(user => {
      const resolvedTickets = user.ticketsAssigned.filter(t => t.status === 'resolved' || t.status === 'closed');
      const resolvedCount = resolvedTickets.length;
      const totalResolutionMs = resolvedTickets.reduce((sum, t) => sum + (t.completedAt!.getTime() - t.createdAt.getTime()), 0);
      const avgResolutionTimeHoursAgent = resolvedCount > 0 ? Math.round((totalResolutionMs / resolvedCount) / (1000 * 60 * 60) * 10) / 10 : 0;
      const ticketsWithResponse = resolvedTickets.filter(t => t.firstResponseAt);
      const totalResponseMs = ticketsWithResponse.reduce((sum, t) => sum + (t.firstResponseAt!.getTime() - t.createdAt.getTime()), 0);
      const avgResponseTimeHours = ticketsWithResponse.length > 0 ? Math.round((totalResponseMs / ticketsWithResponse.length) / (1000 * 60 * 60) * 10) / 10 : 0;
      const slaAdherent = resolvedTickets.filter(t => t.completedAt! <= t.slaDeadline!).length;
      const slaAdherenceRate = resolvedCount > 0 ? Math.round((slaAdherent / resolvedCount) * 100) : null;
      return { id: user.id, nameEn: user.fullNameEn, nameAr: user.fullNameAr, department: user.department?.nameEn || null, resolvedCount, avgResolutionTimeHours: avgResolutionTimeHoursAgent, avgResponseTimeHours, slaAdherenceRate };
    });

    const assetSummary = { total: assets.length, active: assets.filter(a => a.status === 'active').length, maintenance: assets.filter(a => a.status === 'maintenance').length, retired: assets.filter(a => a.status === 'retired').length };

    return {
      stats: { total, pending, resolved, open, overdue: slaBreachCount, slaBreaches, avgResolutionTimeHours, resolvedInternal, resolvedExternal },
      statusDistribution: statusDistribution.map((s: any) => ({ status: s.status, count: s._count._all })),
      priorityDistribution: priorityDistribution.map((p: any) => ({ priority: p.priority, count: p._count._all })),
      departmentPerformance: departmentPerformanceArr.map((d: any) => ({ nameAr: d.nameAr, nameEn: d.nameEn, count: d._count.ticketsIn })),
      recentActivity: recentActivity.map((a: any) => ({ ...a, id: a.id.toString() })),
      agentPerformance,
      exportHistory,
      assetSummary,
    };
  }

  async getStats(userRole: string, userId: number, userDeptId: number | null | undefined) {
    const baseWhere = { ...getBaseTicketFilter(userRole, userId, userDeptId), isArchived: false };

    const [total, pending, open, resolved, overdue, resolvedTickets] = await Promise.all([
      this.prisma.ticket.count({ where: baseWhere }),
      this.prisma.ticket.count({ where: { ...baseWhere, status: 'pending' } }),
      this.prisma.ticket.count({ where: { ...baseWhere, status: 'open' } }),
      this.prisma.ticket.count({ where: { ...baseWhere, status: 'resolved' } }),
      this.prisma.ticket.count({ where: { ...baseWhere, status: { notIn: ['resolved', 'closed'] }, slaDeadline: { lt: new Date() } } }),
      this.prisma.ticket.findMany({ where: { ...baseWhere, completedAt: { not: null }, status: { in: ['resolved', 'closed'] } }, select: { createdAt: true, completedAt: true } }),
    ]);

    let avgResolutionTimeHours = 0;
    if (resolvedTickets.length > 0) {
      const totalMs = resolvedTickets.reduce((acc, t) => acc + (t.completedAt!.getTime() - t.createdAt.getTime()), 0);
      avgResolutionTimeHours = Math.round((totalMs / resolvedTickets.length) / (1000 * 60 * 60) * 10) / 10;
    }

    return { total, pending, resolved, open, overdue, avgResolutionTimeHours };
  }

  async getStatusDistribution(userRole: string, userId: number, userDeptId: number | null | undefined) {
    const baseWhere = { ...getBaseTicketFilter(userRole, userId, userDeptId), isArchived: false };
    const result = await this.prisma.ticket.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } });
    return result.map((r: any) => ({ status: r.status, count: r._count._all }));
  }

  async getPriorityDistribution(userRole: string, userId: number, userDeptId: number | null | undefined) {
    const baseWhere = { ...getBaseTicketFilter(userRole, userId, userDeptId), isArchived: false };
    const result = await this.prisma.ticket.groupBy({ by: ['priority'], where: baseWhere, _count: { _all: true } });
    return result.map((r: any) => ({ priority: r.priority, count: r._count._all }));
  }

  async getDepartmentPerformance() {
    const depts = await this.prisma.department.findMany({ where: { deletedAt: null }, include: { _count: { select: { ticketsIn: true } } } });
    return depts.map((d: any) => ({ nameAr: d.nameAr, nameEn: d.nameEn, count: d._count.ticketsIn }));
  }

  async getRecentActivity() {
    const activities = await this.prisma.auditLog.findMany({
      take: 10, orderBy: { createdAt: 'desc' },
      include: { user: { select: { fullNameAr: true, fullNameEn: true, avatarUrl: true } } },
    });
    return activities.map((a: any) => ({ ...a, id: a.id.toString() }));
  }

  async getAgentPerformance(userRole?: string, userDeptId?: number | null) {
    // C-4: Supervisors only see agents in their own department
    const deptFilter = (userRole === 'supervisor' && userDeptId)
      ? { departmentId: userDeptId }
      : {};

    const users = await this.prisma.user.findMany({
      where: { role: { in: ['agent', 'supervisor'] }, deletedAt: null, ...deptFilter },
      select: { id: true, fullNameEn: true, fullNameAr: true, department: { select: { nameEn: true } },
        ticketsAssigned: { where: { status: { in: ['resolved', 'closed'] } }, select: { createdAt: true, completedAt: true, firstResponseAt: true, slaDeadline: true, status: true } } },
    });

    return users.map(user => {
      const resolvedTickets = user.ticketsAssigned.filter(t => t.status === 'resolved' || t.status === 'closed');
      const resolvedCount = resolvedTickets.length;
      const totalResolutionMs = resolvedTickets.reduce((sum, t) => sum + (t.completedAt!.getTime() - t.createdAt.getTime()), 0);
      const avgResolutionTimeHours = resolvedCount > 0 ? Math.round((totalResolutionMs / resolvedCount) / (1000 * 60 * 60) * 10) / 10 : 0;
      const ticketsWithResponse = resolvedTickets.filter(t => t.firstResponseAt);
      const totalResponseMs = ticketsWithResponse.reduce((sum, t) => sum + (t.firstResponseAt!.getTime() - t.createdAt.getTime()), 0);
      const avgResponseTimeHours = ticketsWithResponse.length > 0 ? Math.round((totalResponseMs / ticketsWithResponse.length) / (1000 * 60 * 60) * 10) / 10 : 0;
      const slaAdherent = resolvedTickets.filter(t => t.completedAt! <= t.slaDeadline!).length;
      const slaAdherenceRate = resolvedCount > 0 ? Math.round((slaAdherent / resolvedCount) * 100) : null;
      return { id: user.id, nameEn: user.fullNameEn, nameAr: user.fullNameAr, department: user.department?.nameEn || null, resolvedCount, avgResolutionTimeHours, avgResponseTimeHours, slaAdherenceRate };
    });
  }

  async getAHT(userRole: string, userId: number, userDeptId: number | null | undefined) {
    const baseWhere = { ...getBaseTicketFilter(userRole, userId, userDeptId), completedAt: { not: null }, status: { in: ['resolved', 'closed'] } };
    const resolvedTickets = await this.prisma.ticket.findMany({ where: baseWhere, select: { id: true, priority: true, departmentId: true } });
    const ticketIds = resolvedTickets.map(t => t.id);

    if (ticketIds.length === 0) {
      return { overallAhtHours: 0, totalResolved: 0, ahtByPriority: [], ahtByDepartment: [] };
    }

    const historyEntries = await this.prisma.ticketStatusHistory.findMany({
      where: { ticketId: { in: ticketIds } },
      orderBy: [{ ticketId: 'asc' }, { createdAt: 'asc' }],
    });

    const ticketMap = new Map(resolvedTickets.map(t => [t.id, t]));
    const ticketDurations = new Map<number, number>();
    const inProgressStart = new Map<number, Date>();

    for (const entry of historyEntries) {
      if (entry.newStatus === 'in_progress' && entry.oldStatus !== 'in_progress') {
        inProgressStart.set(entry.ticketId, entry.createdAt);
      } else if (entry.oldStatus === 'in_progress' && entry.newStatus !== 'in_progress') {
        const start = inProgressStart.get(entry.ticketId);
        if (start) {
          const duration = entry.createdAt.getTime() - start.getTime();
          ticketDurations.set(entry.ticketId, (ticketDurations.get(entry.ticketId) || 0) + duration);
          inProgressStart.delete(entry.ticketId);
        }
      }
    }

    for (const [ticketId, start] of inProgressStart) {
      const duration = Date.now() - start.getTime();
      ticketDurations.set(ticketId, (ticketDurations.get(ticketId) || 0) + duration);
    }

    const totalMs = Array.from(ticketDurations.values()).reduce((sum, d) => sum + d, 0);
    const overallAhtHours = ticketDurations.size > 0 ? Math.round((totalMs / ticketDurations.size) / (1000 * 60 * 60) * 10) / 10 : 0;

    const ahtByPriorityMap = new Map<string, { total: number; count: number }>();
    const ahtByDeptMap = new Map<number, { total: number; count: number }>();

    for (const [ticketId, duration] of ticketDurations) {
      const ticket = ticketMap.get(ticketId);
      if (!ticket) continue;
      const priority = ticket.priority || 'normal';
      const pEntry = ahtByPriorityMap.get(priority) || { total: 0, count: 0 };
      pEntry.total += duration; pEntry.count++;
      ahtByPriorityMap.set(priority, pEntry);

      const deptEntry = ahtByDeptMap.get(ticket.departmentId) || { total: 0, count: 0 };
      deptEntry.total += duration; deptEntry.count++;
      ahtByDeptMap.set(ticket.departmentId, deptEntry);
    }

    const ahtByPriority = Array.from(ahtByPriorityMap.entries()).map(([priority, data]) => ({
      priority, avgHours: Math.round((data.total / data.count) / (1000 * 60 * 60) * 10) / 10, count: data.count,
    }));

    let ahtByDepartment: any[] = [];
    if (userRole === 'super_admin') {
      const deptIds = Array.from(ahtByDeptMap.keys());
      const depts = await this.prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, nameEn: true } });
      const deptMap = new Map(depts.map(d => [d.id, d.nameEn]));
      ahtByDepartment = Array.from(ahtByDeptMap.entries()).map(([deptId, data]) => ({
        departmentId: deptId, departmentName: deptMap.get(deptId) || 'Unknown',
        avgHours: Math.round((data.total / data.count) / (1000 * 60 * 60) * 10) / 10, count: data.count,
      }));
    }

    return { overallAhtHours, totalResolved: resolvedTickets.length, ahtByPriority, ahtByDepartment };
  }

  async getExports(userRole: string, userId: number, pageStr?: string, limitStr?: string) {
    const page = Math.max(1, Number(pageStr) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitStr) || 20));
    const skip = (page - 1) * limit;

    const where = userRole === 'super_admin' ? {} : { exportedById: userId };
    const [data, total] = await Promise.all([
      this.prisma.exportHistory.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { exportedBy: { select: { fullNameAr: true, fullNameEn: true } } },
      }),
      this.prisma.exportHistory.count({ where }),
    ]);

    return { data, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async exportExcel(userId: number, userRole: string, userDeptId: number | null | undefined, startDate?: string, endDate?: string) {
    // C-3: Check canExportData permission before generating export
    if (userRole !== 'super_admin') {
      const userOverride = await this.prisma.userPermissionOverride.findUnique({ where: { userId } });
      let canExport: boolean | null = null;
      if (userOverride && userOverride.canExportData !== null) {
        canExport = userOverride.canExportData;
      } else if (userDeptId) {
        const dept = await this.prisma.department.findUnique({
          where: { id: Number(userDeptId) },
          include: { defaultPermissions: true },
        });
        canExport = dept?.defaultPermissions?.canExportData ?? null;
      }
      // Default: supervisors can export; agents cannot unless explicitly granted
      if (canExport === false || (canExport === null && userRole === 'agent')) {
        throw new (await import('@nestjs/common')).ForbiddenException({ message: 'You do not have permission to export data', code: 'EXPORT_FORBIDDEN' });
      }
    }

    const ExcelJS = await import('exceljs');

    const baseWhere: any = getBaseTicketFilter(userRole, userId, userDeptId);
    if (startDate) baseWhere.createdAt = { ...baseWhere.createdAt, gte: new Date(startDate) };
    if (endDate) baseWhere.createdAt = { ...baseWhere.createdAt, lte: new Date(endDate) };

    const tickets = await this.prisma.ticket.findMany({
      where: baseWhere,
      include: { department: true, ticketType: true, createdBy: { select: { fullNameEn: true } }, assignedTo: { select: { fullNameEn: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tickets Report');

    sheet.columns = [
      { header: 'Ticket #', key: 'ticketNumber', width: 20 },
      { header: 'Subject', key: 'subject', width: 40 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Priority', key: 'priority', width: 12 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Type', key: 'type', width: 20 },
      { header: 'Creator', key: 'creator', width: 20 },
      { header: 'Assigned To', key: 'assignedTo', width: 20 },
      { header: 'Created At', key: 'createdAt', width: 20 },
      { header: 'SLA Deadline', key: 'slaDeadline', width: 20 },
    ];

      tickets.forEach(t => sheet.addRow({
        ticketNumber: t.ticketNumber, subject: t.subject, status: t.status, priority: t.priority,
        department: t.department?.nameEn || '', type: t.ticketType?.nameEn || '',
        creator: t.createdBy?.fullNameEn || '', assignedTo: t.assignedTo?.fullNameEn || '',
        createdAt: t.createdAt?.toISOString() || '', slaDeadline: t.slaDeadline?.toISOString() || '',
      }));

    const timestamp = Date.now();
    const fileName = `tickets_report_${timestamp}.xlsx`;
    const fileUrl = `/uploads/exports/${fileName}`;
    const filePath = path.join(EXPORTS_DIR, fileName);

    if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    await workbook.xlsx.writeFile(filePath);

    await this.prisma.exportHistory.create({
      data: {
        exportedById: userId, departmentId: userDeptId,
        dateFrom: startDate ? new Date(startDate) : new Date(0),
        dateTo: endDate ? new Date(endDate) : new Date(),
        fileName, fileUrl, ticketCount: tickets.length,
        expiresAt: new Date(new Date().setHours(27, 0, 0, 0)),
      },
    });

    return { filePath, fileName, fileUrl };
  }
}
