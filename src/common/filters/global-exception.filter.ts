import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred. Please contact IT support.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      message = typeof exResponse === 'string' ? exResponse : (exResponse as any).message || message;
    }

    // SECURITY FIX: Never expose stack traces in production
    const isProd = process.env.NODE_ENV === 'production';
    if (!isProd) {
      this.logger.error(`Unhandled Error: ${exception instanceof Error ? exception.message : exception}`, 
        exception instanceof Error ? exception.stack : '');
    }

    response.status(status).json({
      message: isProd && status === HttpStatus.INTERNAL_SERVER_ERROR
        ? 'An unexpected error occurred. Please contact IT support.'
        : message,
      requestId: request.headers['x-request-id'] || undefined,
      ...(isProd ? {} : { stack: exception instanceof Error ? exception.stack : undefined }),
    });
  }
}
