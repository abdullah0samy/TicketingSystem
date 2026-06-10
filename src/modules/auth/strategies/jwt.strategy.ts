import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || '';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: ACCESS_SECRET,
    });
  }

  async validate(payload: { id: number; role: string; departmentId: number | null }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true, departmentId: true, isActive: true, fullNameEn: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({ message: 'User not found or inactive', code: 'INVALID_TOKEN' });
    }

    return { id: user.id, role: user.role, departmentId: user.departmentId, fullNameEn: user.fullNameEn };
  }
}
