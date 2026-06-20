import { Controller, Get, Post, Delete, Param, Body, UseGuards, Inject, HttpCode, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TeamNotesService } from './team-notes.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Team Notes')
@ApiBearerAuth()
@Controller('api/team-notes')
@UseGuards(JwtAuthGuard)
export class TeamNotesController {
  constructor(@Inject(TeamNotesService) private readonly teamNotesService: TeamNotesService) {}

  @Get()
  async findAll(@CurrentUser('id') userId: number) {
    return this.teamNotesService.findAll(userId);
  }

  @Post()
  @HttpCode(201)
  async create(@CurrentUser('id') userId: number, @Body() body: { body?: string; attachments?: any[] }) {
    return this.teamNotesService.create(userId, body);
  }

  @Post(':id/comments')
  @HttpCode(201)
  async addComment(@CurrentUser('id') userId: number, @Param('id') id: string, @Body() body: { body?: string }) {
    return this.teamNotesService.addComment(userId, parseInt(id), body);
  }

  @Post(':id/like')
  @HttpCode(200)
  async toggleLike(@CurrentUser('id') userId: number, @Param('id') id: string) {
    return this.teamNotesService.toggleLike(userId, parseInt(id));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser('id') userId: number, @Req() req: any, @Param('id') id: string) {
    await this.teamNotesService.remove(userId, req.user.role, parseInt(id));
  }
}
