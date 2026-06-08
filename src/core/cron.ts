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
        }
      });

      for (const ticket of breachedTickets) {
        // Send alert to department (using statically imported getIO)
        const io = getIO();
        io.to(`dept-${ticket.departmentId}`).emit('sla-breach', {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          deadline: ticket.slaDeadline
        });

        // PERSIST NOTIFICATION
        // Find all users in this department
        const deptUsers = await prisma.user.findMany({
          where: { departmentId: ticket.departmentId, isActive: true }
        });

        if (deptUsers.length > 0) {
          await prisma.notification.createMany({
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

        // Mark as sent
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { slaBreachSent: true }
        });
        
        console.log(`🚨 SLA Breach alert sent for ${ticket.ticketNumber}`);
      }

      // 2. Check for SLA Warnings (80% time consumed)
      // We need to know when it was created to calculate 80%
      const pendingTickets = await prisma.ticket.findMany({
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
          const io = getIO();
          io.to(`dept-${ticket.departmentId}`).emit('sla-warning', {
            id: ticket.id,
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            percentage: Math.round(percentage)
          });

          // PERSIST NOTIFICATION
          const deptUsers = await prisma.user.findMany({
            where: { departmentId: ticket.departmentId, isActive: true }
          });

          if (deptUsers.length > 0) {
            await prisma.notification.createMany({
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

          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { slaWarningSent: true }
          });

          console.log(`⚠️ SLA Warning alert sent for ${ticket.ticketNumber} (${Math.round(percentage)}%)`);
        }
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
      const ticketsToArchive = await prisma.ticket.findMany({
        where: {
          status: { in: ['resolved', 'closed'] },
          updatedAt: { lt: thirtyDaysAgo },
          isArchived: false
        }
      });

      // Find a super admin for logging the auto-archiving action
      const systemAdmin = await prisma.user.findFirst({
        where: { role: 'super_admin' }
      });

      for (const ticket of ticketsToArchive) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { 
            isArchived: true,
            archivedAt: new Date()
          }
        });
        
        // Log the action
        await prisma.auditLog.create({
          data: {
            ticketId: ticket.id,
            userId: systemAdmin?.id || 1, 
            action: 'AUTO_ARCHIVED',
            departmentId: ticket.departmentId,
            newData: { reason: 'Auto-archived after 30 days of inactivity' }
          }
        });
      }

      console.log(`✅ Auto-archived ${ticketsToArchive.length} tickets.`);
    } catch (error) {
      console.error('❌ Error during auto-archive:', error);
    }
  });
};
