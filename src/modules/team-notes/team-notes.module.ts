import { Module } from '@nestjs/common';
import { TeamNotesController } from './team-notes.controller';
import { TeamNotesService } from './team-notes.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TeamNotesController],
  providers: [TeamNotesService],
})
export class TeamNotesModule {}
