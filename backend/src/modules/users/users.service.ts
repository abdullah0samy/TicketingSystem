import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: {
          include: { defaultPermissions: true },
        },
        permissionsOverride: true,
      },
    });

    if (!user) {
      throw new NotFoundException({ message: 'User not found' });
    }

    return {
      id: user.id,
      badgeNumber: user.badgeNumber,
      username: user.username,
      fullNameAr: user.fullNameAr,
      fullNameEn: user.fullNameEn,
      role: user.role,
      department: user.department,
      langPref: user.langPref,
      avatarUrl: user.avatarUrl,
    };
  }

  async updateProfile(userId: number, body: { fullNameAr?: string; fullNameEn?: string; email?: string; langPref?: string }) {
    const { fullNameAr, fullNameEn, email, langPref } = body;

    if (!fullNameAr) {
      throw new BadRequestException({ message: 'Arabic name is required' });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException({ message: 'Invalid email format' });
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(fullNameAr !== undefined && { fullNameAr }),
        ...(fullNameEn !== undefined && { fullNameEn }),
        ...(email !== undefined && { email }),
        ...(langPref !== undefined && { langPref }),
      },
      include: {
        department: {
          include: { defaultPermissions: true },
        },
        permissionsOverride: true,
      },
    });

    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async updateAvatar(userId: number, file: Express.Multer.File) {
    const sharp = await import('sharp');
    const path = await import('path');
    const fs = await import('fs');

    const originalPath = file.path;
    const ext = path.extname(file.filename);
    const resizedFilename = `resized-${file.filename}`;
    const resizedPath = path.join(file.destination, resizedFilename);

    await sharp.default(originalPath)
      .resize(200, 200, { fit: 'cover' })
      .toFile(resizedPath);

    fs.unlinkSync(originalPath);

    const avatarUrl = `/uploads/avatars/${resizedFilename}`;

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    return { message: 'Avatar updated successfully', avatarUrl };
  }
}
