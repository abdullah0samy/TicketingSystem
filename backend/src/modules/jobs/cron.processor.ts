import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { CronService } from './cron.service';

@Processor('cron-jobs')
export class CronProcessor extends WorkerHost {
  constructor(@Inject(CronService) private readonly cronService: CronService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'cleanup-exports':
        await this.cronService.cleanupExports();
        break;
      case 'sla-check':
        await this.cronService.slaCheck();
        break;
      case 'auto-archive':
        await this.cronService.autoArchive();
        break;
    }
  }
}
