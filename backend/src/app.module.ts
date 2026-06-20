import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './common/health/health.controller';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { MutationLoggerInterceptor } from './common/interceptors/mutation-logger.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AdminModule } from './modules/admin/admin.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ProfileModule } from './modules/profile/profile.module';
import { AuditModule } from './modules/audit/audit.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { AssetsModule } from './modules/assets/assets.module';
import { TeamNotesModule } from './modules/team-notes/team-notes.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { GatewaysModule } from './gateways/gateways.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'global', ttl: 900000, limit: 2000 },
      { name: 'login', ttl: 900000, limit: 50 },
      { name: 'auth', ttl: 900000, limit: 100 },
      { name: 'search', ttl: 60000, limit: 60 },
      { name: 'analytics', ttl: 900000, limit: 300 },
      { name: 'upload', ttl: 3600000, limit: 100 },
    ]),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        retryStrategy: (times: number) => Math.min(times * 100, 3000),
        maxRetriesPerRequest: null,
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AdminModule,
    TicketsModule,
    AnalyticsModule,
    ProfileModule,
    AuditModule,
    UploadsModule,
    AssetsModule,
    TeamNotesModule,
    KnowledgeModule,
    NotificationsModule,
    JobsModule,
    GatewaysModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: MutationLoggerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
