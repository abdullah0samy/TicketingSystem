import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_PAGE_SIZE = 100;

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getLogs(params: {
    userId?: number; action?: string; departmentId?: number;
    startDate?: string; endDate?: string; ticketId?: number;
    page?: number; limit?: number;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(Math.max(1, Number(params.limit) || 20), MAX_PAGE_SIZE);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.departmentId) where.departmentId = params.departmentId;
    if (params.ticketId) where.ticketId = params.ticketId;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) {
        const end = new Date(params.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { fullNameAr: true, fullNameEn: true, username: true, badgeNumber: true } },
          department: { select: { nameAr: true, nameEn: true } },
          ticket: { select: { ticketNumber: true, subject: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { logs, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getActions() {
    const result = await this.prisma.auditLog.groupBy({ by: ['action'] });
    return result.map(r => r.action);
  }
}
