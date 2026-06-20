import { Module, OnModuleInit } from '@nestjs/common';
import { InjectQueue, BullModule } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { CronProcessor } from './cron.processor';
import { CronService } from './cron.service';

class CronSchedulerService implements OnModuleInit {
  constructor(@InjectQueue('cron-jobs') private readonly cronQueue: Queue) {}

  async onModuleInit() {
    await this.cronQueue.upsertJobScheduler(
      'cleanup-exports',
      { pattern: '0 3 * * *' },
      { name: 'cleanup-exports', data: {} }
    );

    await this.cronQueue.upsertJobScheduler(
      'sla-check',
      { pattern: '*/5 * * * *' },
      { name: 'sla-check', data: {} }
    );

    await this.cronQueue.upsertJobScheduler(
      'auto-archive',
      { pattern: '0 4 * * *' },
      { name: 'auto-archive', data: {} }
    );
  }
}

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'cron-jobs' }),
  ],
  providers: [CronProcessor, CronService, CronSchedulerService],
})
export class JobsModule {}
