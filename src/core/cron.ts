import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import prisma from './db.ts';
import fs from 'fs';
import path from 'path';
import { getIO } from './socket.ts';
import { EXPORTS_DIR } from './paths.ts';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });

const cronQueue = new Queue('cron-jobs', { connection });

const JOB_NAMES = {
  CLEANUP_EXPORTS: 'cleanup-exports',
  SLA_CHECK: 'sla-check',
  AUTO_ARCHIVE: 'auto-archive',
};

async function cleanupExports() {
  console.log('🕒 Running selective cleanup of expired exports at 3:00 AM...');
  const now = new Date();
  const expiredExports = await prisma.exportHistory.findMany({
    where: { expiresAt: { lte: now } }
  });

  if (expiredExports.length === 0) {
    console.log('✅ No expired exports to clean.');
    return;
  }

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

  const { count } = await prisma.exportHistory.deleteMany({
    where: { expiresAt: { lte: now } }
  });

  console.log(`✅ Selective cleanup complete. Deleted ${count} expired export records and files.`);
}

async function slaCheck() {
  console.log('🕒 Running SLA check...');
  const now = new Date();

  const breachedTickets = await prisma.ticket.findMany({
    where: {
      status: { notIn: ['resolved', 'closed'] },
      slaDeadline: { lt: now },
      slaBreachSent: false
    }
  });

  for (const ticket of breachedTickets) {
    const io = getIO();
    io.to(`dept-${ticket.departmentId}`).emit('sla-breach', {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      deadline: ticket.slaDeadline
    });

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

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { slaBreachSent: true }
    });

    console.log(`🚨 SLA Breach alert sent for ${ticket.ticketNumber}`);
  }

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
}

async function autoArchive() {
  console.log('🕒 Running auto-archive job...');
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const ticketsToArchive = await prisma.ticket.findMany({
    where: {
      status: { in: ['resolved', 'closed'] },
      completedAt: { lt: thirtyDaysAgo },
      isArchived: false
    }
  });

  const systemAdmin = await prisma.user.findFirst({
    where: { role: 'super_admin' }
  });

  for (const ticket of ticketsToArchive) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { isArchived: true, archivedAt: new Date() }
    });

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
}

const worker = new Worker(
  'cron-jobs',
  async (job) => {
    switch (job.name) {
      case JOB_NAMES.CLEANUP_EXPORTS:
        await cleanupExports();
        break;
      case JOB_NAMES.SLA_CHECK:
        await slaCheck();
        break;
      case JOB_NAMES.AUTO_ARCHIVE:
        await autoArchive();
        break;
    }
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error(`❌ Cron job ${job?.name} failed:`, err);
});

export const initCron = async () => {
  await cronQueue.upsertJobScheduler(
    JOB_NAMES.CLEANUP_EXPORTS,
    { pattern: '0 3 * * *' },
    { name: JOB_NAMES.CLEANUP_EXPORTS, data: {} }
  );

  await cronQueue.upsertJobScheduler(
    JOB_NAMES.SLA_CHECK,
    { pattern: '*/5 * * * *' },
    { name: JOB_NAMES.SLA_CHECK, data: {} }
  );

  await cronQueue.upsertJobScheduler(
    JOB_NAMES.AUTO_ARCHIVE,
    { pattern: '0 4 * * *' },
    { name: JOB_NAMES.AUTO_ARCHIVE, data: {} }
  );

  console.log('⏰ BullMQ cron jobs registered');
};
