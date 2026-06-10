import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class MutationLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('API');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    if (req.method !== 'GET') {
      const userLabel = req.user ? `${req.user.email} (${req.user.role})` : 'Anonymous';
      this.logger.log(`[API_MUTATION] ${req.method} ${req.originalUrl || req.url} by ${userLabel}`);
    }
    return next.handle();
  }
}
