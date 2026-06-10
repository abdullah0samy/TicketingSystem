import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import fs from 'fs';
import path from 'path';
import { EXPORTS_DIR } from '../../core/paths';

@Injectable()
export class CronService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async cleanupExports() {
    const now = new Date();
    const expiredExports = await this.prisma.exportHistory.findMany({
      where: { expiresAt: { lte: now } }
    });

    if (expiredExports.length === 0) return;

    const exportDir = EXPORTS_DIR;
    for (const rec of expiredExports) {
      if (rec.fileName) {
        const filePath = path.join(exportDir, rec.fileName);
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`Failed to delete expired file ${rec.fileName}:`, err);
        }
      }
    }

    const { count } = await this.prisma.exportHistory.deleteMany({
      where: { expiresAt: { lte: now } }
    });
  }

  async slaCheck() {
    const now = new Date();

    const breachedTickets = await this.prisma.ticket.findMany({
      where: {
        status: { notIn: ['resolved', 'closed'] },
        slaDeadline: { lt: now },
        slaBreachSent: false
      }
    });

    for (const ticket of breachedTickets) {
      const deptUsers = await this.prisma.user.findMany({
        where: { departmentId: ticket.departmentId, isActive: true }
      });

      if (deptUsers.length > 0) {
        await this.prisma.notification.createMany({
          data: deptUsers.map(u => ({
            userId: u.id,
            ticketId: ticket.id,
            eventType: 'SLA_BREACH',
            titleEn: 'SLA Breach Alert',
            titleAr: 'تنبيه تجاوز اتفاقية مستوى الخدمة',
            bodyEn: `Ticket ${ticket.ticketNumber} has breached its SLA deadline.`,
            bodyAr: `تجاوزت التذكرة رقم ${ticket.ticketNumber} الموعد النهائي المحدد.`
          }))
        });
      }

      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { slaBreachSent: true }
      });
    }

    const pendingTickets = await this.prisma.ticket.findMany({
      where: {
        status: { notIn: ['resolved', 'closed'] },
        slaDeadline: { gt: now },
        slaWarningSent: false
      }
    });

    for (const ticket of pendingTickets) {
      if (!ticket.slaDeadline) continue;
      const totalSlaTime = ticket.slaDeadline.getTime() - ticket.createdAt.getTime();
      const timeElapsed = now.getTime() - ticket.createdAt.getTime();
      const percentage = (timeElapsed / totalSlaTime) * 100;

      if (percentage >= 80) {
        const deptUsers = await this.prisma.user.findMany({
          where: { departmentId: ticket.departmentId, isActive: true }
        });

        if (deptUsers.length > 0) {
          await this.prisma.notification.createMany({
            data: deptUsers.map(u => ({
              userId: u.id,
              ticketId: ticket.id,
              eventType: 'SLA_WARNING',
              titleEn: 'SLA Warning',
              titleAr: 'تحذير اتفاقية مستوى الخدمة',
              bodyEn: `Ticket ${ticket.ticketNumber} has consumed ${Math.round(percentage)}% of its SLA time.`,
              bodyAr: `استهلكت التذكرة رقم ${ticket.ticketNumber} حوالي ${Math.round(percentage)}% من الوقت المحدد.`
            }))
          });
        }

        await this.prisma.ticket.update({
          where: { id: ticket.id },
          data: { slaWarningSent: true }
        });
      }
    }
  }

  async autoArchive() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const ticketsToArchive = await this.prisma.ticket.findMany({
      where: {
        status: { in: ['resolved', 'closed'] },
        completedAt: { lt: thirtyDaysAgo },
        isArchived: false
      }
    });

    const systemAdmin = await this.prisma.user.findFirst({
      where: { role: 'super_admin' }
    });

    for (const ticket of ticketsToArchive) {
      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { isArchived: true, archivedAt: new Date() }
      });

      await this.prisma.auditLog.create({
        data: {
          ticketId: ticket.id,
          userId: systemAdmin?.id || 1,
          action: 'AUTO_ARCHIVED',
          departmentId: ticket.departmentId,
          newData: { reason: 'Auto-archived after 30 days of inactivity' }
        }
      });
    }
  }
}
