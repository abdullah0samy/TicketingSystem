import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProfileService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, badgeNumber: true, username: true, fullNameAr: true, fullNameEn: true,
        email: true, role: true, avatarUrl: true, about: true, isActive: true, departmentId: true,
        department: { select: { nameAr: true, nameEn: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: number, body: { avatarUrl?: string; about?: string }) {
    const data: any = {};
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;
    if (body.about !== undefined) data.about = body.about;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true, badgeNumber: true, username: true, fullNameAr: true, fullNameEn: true,
        email: true, role: true, avatarUrl: true, about: true, isActive: true, departmentId: true,
        department: { select: { nameAr: true, nameEn: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'PROFILE_UPDATED',
        newData: { avatarUrl: body.avatarUrl, about: body.about },
        entityType: 'USER_PROFILE',
        entityId: user.id,
      },
    });

    return user;
  }
}
