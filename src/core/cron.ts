import cron from 'node-cron';
import prisma from './db.ts';
import fs from 'fs';
import path from 'path';
import { getIO } from './socket.ts';
import { EXPORTS_DIR } from './paths.ts'; // BUG FIX #6: Static import — prevents repeated dynamic import overhead inside loops


export const initCron = () => {
  // Run at 3:00 AM every day
  // Cron format: minute hour day-of-month month day-of-week
  // Run at 3:00 AM every day - Selective cleanup of EXPIRED exports
  cron.schedule('0 3 * * *', async () => {
    console.log('🕒 Running selective cleanup of expired exports at 3:00 AM...');
    const now = new Date();
    
    try {
      // 1. Get ONLY expired records
      const expiredExports = await prisma.exportHistory.findMany({
        where: { expiresAt: { lte: now } }
      });
      
      if (expiredExports.length === 0) {
        console.log('✅ No expired exports to clean.');
        return;
      }

      // 2. Delete physical files for expired records
      const exportDir = EXPORTS_DIR;
      for (const rec of expiredExports) {
        if (rec.fileName) {
          const filePath = path.join(exportDir, rec.fileName);
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (err) {
            console.error(`Failed to delete expired file ${rec.fileName}:`, err);
          }
        }
      }
      
      // 3. Clear expired records from DB
      const { count } = await prisma.exportHistory.deleteMany({
        where: { expiresAt: { lte: now } }
      });
      
      console.log(`✅ Selective cleanup complete. Deleted ${count} expired export records and files.`);
    } catch (error) {
      console.error('❌ Error during selective cleanup:', error);
    }
  });

  // SLA Check every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('🕒 Running SLA check...');
    const now = new Date();

    try {
      // 1. Check for SLA Breaches (Deadline passed)
      const breachedTickets = await prisma.ticket.findMany({
        where: {
          status: { notIn: ['resolved', 'closed'] },
          slaDeadline: { lt: now },
          slaBreachSent: false
        },
        select: { id: true, ticketNumber: true, subject: true, slaDeadline: true, departmentId: true }
      });

      if (breachedTickets.length > 0) {
        const io = getIO();
        const notificationData: any[] = [];

        for (const ticket of breachedTickets) {
          io.to(`dept-${ticket.departmentId}`).emit('sla-breach', {
            id: ticket.id,
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            deadline: ticket.slaDeadline
          });

          const deptUsers = await prisma.user.findMany({
            where: { departmentId: ticket.departmentId, isActive: true },
            select: { id: true }
          });

          for (const u of deptUsers) {
            notificationData.push({
              userId: u.id,
              ticketId: ticket.id,
              eventType: 'SLA_BREACH',
              titleEn: 'SLA Breach Alert',
              titleAr: 'تنبيه تجاوز اتفاقية مستوى الخدمة',
              bodyEn: `Ticket ${ticket.ticketNumber} has breached its SLA deadline.`,
              bodyAr: `تجاوزت التذكرة رقم ${ticket.ticketNumber} الموعد النهائي المحدد.`
            });
          }
        }

        if (notificationData.length > 0) {
          await prisma.notification.createMany({ data: notificationData });
        }

        await prisma.ticket.updateMany({
          where: { id: { in: breachedTickets.map(t => t.id) } },
          data: { slaBreachSent: true }
        });

        console.log(`🚨 SLA Breach alerts sent for ${breachedTickets.length} tickets`);
      }

      // 2. Check for SLA Warnings (80% time consumed)
      // OPTIMIZATION: Only check tickets created within last 7 days to avoid scanning stale data
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const pendingTickets = await prisma.ticket.findMany({
        where: {
          status: { notIn: ['resolved', 'closed'] },
          slaDeadline: { gt: now },
          slaWarningSent: false,
          createdAt: { gte: sevenDaysAgo }
        },
        select: { id: true, ticketNumber: true, subject: true, slaDeadline: true, createdAt: true, departmentId: true }
      });

      const warningTickets: typeof pendingTickets = [];
      const warningNotifications: any[] = [];

      for (const ticket of pendingTickets) {
        if (!ticket.slaDeadline) continue;

        const totalSlaTime = ticket.slaDeadline.getTime() - ticket.createdAt.getTime();
        const timeElapsed = now.getTime() - ticket.createdAt.getTime();
        const percentage = (timeElapsed / totalSlaTime) * 100;

        if (percentage >= 80) {
          warningTickets.push(ticket);
        }
      }

      if (warningTickets.length > 0) {
        const io = getIO();

        for (const ticket of warningTickets) {
          const totalSlaTime = ticket.slaDeadline!.getTime() - ticket.createdAt.getTime();
          const timeElapsed = now.getTime() - ticket.createdAt.getTime();
          const percentage = (timeElapsed / totalSlaTime) * 100;

          io.to(`dept-${ticket.departmentId}`).emit('sla-warning', {
            id: ticket.id,
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            percentage: Math.round(percentage)
          });

          const deptUsers = await prisma.user.findMany({
            where: { departmentId: ticket.departmentId, isActive: true },
            select: { id: true }
          });

          for (const u of deptUsers) {
            warningNotifications.push({
              userId: u.id,
              ticketId: ticket.id,
              eventType: 'SLA_WARNING',
              titleEn: 'SLA Warning',
              titleAr: 'تحذير اتفاقية مستوى الخدمة',
              bodyEn: `Ticket ${ticket.ticketNumber} has consumed ${Math.round(percentage)}% of its SLA time.`,
              bodyAr: `استهلكت التذكرة رقم ${ticket.ticketNumber} حوالي ${Math.round(percentage)}% من الوقت المحدد.`
            });
          }
        }

        if (warningNotifications.length > 0) {
          await prisma.notification.createMany({ data: warningNotifications });
        }

        await prisma.ticket.updateMany({
          where: { id: { in: warningTickets.map(t => t.id) } },
          data: { slaWarningSent: true }
        });

        console.log(`⚠️ SLA Warning alerts sent for ${warningTickets.length} tickets`);
      }
    } catch (error) {
      console.error('❌ Error during SLA check:', error);
    }
  });

  // Auto-archive resolved/closed tickets after 30 days
  cron.schedule('0 4 * * *', async () => {
    console.log('🕒 Running auto-archive job...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      // FIX: Use completedAt/closedAt instead of updatedAt — updatedAt changes on comments/reopens
      const ticketsToArchive = await prisma.ticket.findMany({
        where: {
          status: { in: ['resolved', 'closed'] },
          OR: [
            { completedAt: { lt: thirtyDaysAgo } },
            { closedAt: { lt: thirtyDaysAgo } }
          ],
          isArchived: false
        },
        select: { id: true, departmentId: true }
      });

      if (ticketsToArchive.length > 0) {
        const systemAdmin = await prisma.user.findFirst({
          where: { role: 'super_admin' },
          select: { id: true }
        });

        await prisma.ticket.updateMany({
          where: { id: { in: ticketsToArchive.map(t => t.id) } },
          data: { isArchived: true, archivedAt: new Date() }
        });

        const auditData = ticketsToArchive.map(ticket => ({
          ticketId: ticket.id,
          userId: systemAdmin?.id || 1,
          action: 'AUTO_ARCHIVED',
          departmentId: ticket.departmentId,
          newData: { reason: 'Auto-archived after 30 days of inactivity' }
        }));

        await prisma.auditLog.createMany({ data: auditData });

        console.log(`✅ Auto-archived ${ticketsToArchive.length} tickets.`);
      } else {
        console.log('✅ No tickets to auto-archive.');
      }
    } catch (error) {
      console.error('❌ Error during auto-archive:', error);
    }
  });

  // Clean up old notifications (older than 90 days)
  cron.schedule('0 5 * * 0', async () => {
    console.log('🕒 Running notification cleanup (weekly)...');
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    try {
      const { count } = await prisma.notification.deleteMany({
        where: { createdAt: { lt: ninetyDaysAgo } }
      });
      console.log(`✅ Cleaned up ${count} old notifications.`);
    } catch (error) {
      console.error('❌ Error during notification cleanup:', error);
    }
  });

  // Clean up old audit logs (older than 365 days)
  cron.schedule('0 6 * * 0', async () => {
    console.log('🕒 Running audit log cleanup (weekly)...');
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    try {
      const { count } = await prisma.auditLog.deleteMany({
        where: { createdAt: { lt: oneYearAgo } }
      });
      console.log(`✅ Cleaned up ${count} old audit logs.`);
    } catch (error) {
      console.error('❌ Error during audit log cleanup:', error);
    }
  });
};
