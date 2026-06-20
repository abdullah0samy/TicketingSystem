import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import webpush from 'web-push';

@Injectable()
export class NotificationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
    if (vapidPublicKey && vapidPrivateKey) {
      webpush.setVapidDetails(
        process.env.VAPID_CONTACT || 'mailto:admin@abch.com',
        vapidPublicKey,
        vapidPrivateKey,
      );
    }
  }

  async findAll(userId: number, page: number = 1, limit: number = 50) {
    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, Math.max(1, limit));
    const skip = (pageNum - 1) * limitNum;

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        include: { ticket: { select: { id: true, ticketNumber: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      data: notifications,
      unreadCount,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    };
  }

  async markRead(userId: number, id: number) {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { success: true };
  }

  async subscribe(userId: number, body: { endpoint: string; p256dh: string; auth: string }) {
    const existing = await this.prisma.pushSubscription.findFirst({
      where: { userId, endpoint: body.endpoint },
    });
    if (existing) return existing;
    return this.prisma.pushSubscription.create({
      data: { userId, endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth },
    });
  }

  async unsubscribe(userId: number, body: { endpoint: string }) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint: body.endpoint },
    });
    return { success: true };
  }
}
