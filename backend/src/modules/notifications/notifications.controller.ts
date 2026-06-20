import { Controller, Get, Put, Post, Delete, Param, Body, Query, UseGuards, Inject, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notificationsService: NotificationsService) {}

  @Get()
  async findAll(@CurrentUser('id') userId: number, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.notificationsService.findAll(userId, page ? parseInt(page) : 1, limit ? parseInt(limit) : 50);
  }

  @Put(':id/read')
  async markRead(@CurrentUser('id') userId: number, @Param('id') id: string) {
    return this.notificationsService.markRead(userId, parseInt(id));
  }

  @Put('read-all')
  async markAllRead(@CurrentUser('id') userId: number) {
    return this.notificationsService.markAllRead(userId);
  }

  @Post('subscribe')
  @HttpCode(201)
  async subscribe(@CurrentUser('id') userId: number, @Body() body: { endpoint: string; p256dh: string; auth: string }) {
    return this.notificationsService.subscribe(userId, body);
  }

  @Delete('subscribe')
  @HttpCode(204)
  async unsubscribe(@CurrentUser('id') userId: number, @Body() body: { endpoint: string }) {
    await this.notificationsService.unsubscribe(userId, body);
  }
}
