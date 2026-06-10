import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('cron-jobs')
export class SlaProcessor extends WorkerHost {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'sla-check':
        await this.handleSlaCheck();
        break;
    }
  }

  private async handleSlaCheck() {
    const now = new Date();

    const breachedTickets = await this.prisma.ticket.findMany({
      where: {
        status: { notIn: ['resolved', 'closed'] },
        slaDeadline: { lt: now },
        slaBreachSent: false
      }
    });

    for (const ticket of breachedTickets) {
      // TODO: Emit socket 'sla-breach' event - socket gateway not yet migrated
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
        // TODO: Emit socket 'sla-warning' event - socket gateway not yet migrated
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
}
