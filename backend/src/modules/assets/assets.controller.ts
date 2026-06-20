import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Inject, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AssetsService } from './assets.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Assets')
@ApiBearerAuth()
@Controller('api/assets')
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(@Inject(AssetsService) private readonly assetsService: AssetsService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'supervisor', 'agent')
  async findAll() {
    return this.assetsService.findAll();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'supervisor')
  @HttpCode(201)
  async create(@CurrentUser('id') userId: number, @Body() body: any) {
    return this.assetsService.create(userId, body);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'supervisor')
  async update(@CurrentUser('id') userId: number, @Param('id') id: string, @Body() body: any) {
    return this.assetsService.update(userId, parseInt(id), body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  @HttpCode(204)
  async remove(@CurrentUser('id') userId: number, @Param('id') id: string) {
    await this.assetsService.remove(userId, parseInt(id));
  }
}
