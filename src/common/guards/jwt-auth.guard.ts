import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { verifyAccessToken } from '../../modules/auth/auth.utils';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw new UnauthorizedException({ error: 'Unauthorized', code: 'MISSING_TOKEN' });
    }

    try {
      const decoded = verifyAccessToken(token);
      request.user = decoded;
      return true;
    } catch (error) {
      throw new ForbiddenException({ message: 'Forbidden or expired token', code: 'FORBIDDEN' });
    }
  }
}
