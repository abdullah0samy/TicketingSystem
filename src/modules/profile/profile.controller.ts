import { Controller, Get, Put, Body, UseGuards, Inject } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProfileService } from './profile.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Profile')
@ApiBearerAuth()
@Controller('api/profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly profileService: ProfileService) {}

  @Get()
  async getProfile(@CurrentUser('id') userId: number) {
    return this.profileService.getProfile(userId);
  }

  @Put()
  async updateProfile(@CurrentUser('id') userId: number, @Body() body: { avatarUrl?: string; about?: string }) {
    return this.profileService.updateProfile(userId, body);
  }
}
