import { Injectable, Inject, UnauthorizedException, ForbiddenException, BadRequestException, HttpException, Logger } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from './auth.utils';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async login(identifier: string, password: string) {
    if (!identifier || !password) {
      throw new BadRequestException('ID and password are required');
    }

    if (typeof password !== 'string' || password.length > 128) {
      throw new BadRequestException('Invalid password format');
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(identifier)) {
      throw new BadRequestException('Invalid identifier format');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { badgeNumber: identifier },
          { username: identifier },
        ],
      },
      include: { department: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({ message: 'Invalid credentials or inactive account' });
    }

    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      throw new HttpException({
        message: 'Account locked. Too many failed attempts.',
        lockUntil: user.lockUntil,
      }, 423);
    }

    if (user.lockUntil && new Date(user.lockUntil) <= new Date()) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockUntil: null },
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      const newAttempts = (user.failedLoginAttempts || 0) + 1;
      const lockData: any = { failedLoginAttempts: newAttempts };
      if (newAttempts >= 5) {
        lockData.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: lockData,
      });
      throw new UnauthorizedException({ message: 'Invalid credentials' });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        badgeNumber: user.badgeNumber,
        username: user.username,
        fullNameAr: user.fullNameAr,
        fullNameEn: user.fullNameEn,
        role: user.role,
        department: user.department,
      },
    };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException({ message: 'Refresh token required' });
    }

    try {
      const decoded = verifyRefreshToken(refreshToken) as any;

      if (!decoded || !decoded.id) {
        throw new ForbiddenException({ message: 'Invalid refresh token payload' });
      }

      const user = await this.prisma.user.findUnique({ where: { id: decoded.id } });

      if (!user || !user.isActive) {
        throw new UnauthorizedException({ message: 'Invalid refresh token or inactive account' });
      }

      const newAccessToken = generateAccessToken(user);
      return { accessToken: newAccessToken };
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException({ message: 'Invalid or expired refresh token' });
    }
  }

  logout() {
    return { message: 'Logged out successfully' };
  }
}
