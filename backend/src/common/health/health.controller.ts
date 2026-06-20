import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('api')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('health')
  async check() {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const mem = process.memoryUsage();
      return {
        status: 'ok',
        service: 'ABCH Ticketing System API (NestJS)',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((process.uptime ? process.uptime() : 0)),
        database: 'connected',
        memory: {
          used: Math.round(mem.heapUsed / 1024 / 1024),
          total: Math.round(mem.heapTotal / 1024 / 1024),
          unit: 'MB',
        },
        responseTime: `${Date.now() - start}ms`,
      };
    } catch {
      return {
        status: 'error',
        message: 'Database connection failed',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
