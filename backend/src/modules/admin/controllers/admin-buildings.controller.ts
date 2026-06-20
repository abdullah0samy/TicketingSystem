import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Inject, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin - Buildings')
@ApiBearerAuth()
@Controller('api/admin/buildings')
@UseGuards(JwtAuthGuard)
export class AdminBuildingsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'supervisor', 'agent')
  async findAll() {
    return this.prisma.building.findMany({
      include: { _count: { select: { floors: true } } },
      orderBy: { nameEn: 'asc' },
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async create(@Body() body: { nameAr: string; nameEn: string; isActive?: boolean }) {
    if (!body.nameAr || !body.nameEn) {
      throw new BadRequestException({ message: 'Names are required' });
    }
    return this.prisma.building.create({
      data: {
        nameAr: body.nameAr,
        nameEn: body.nameEn,
        isActive: body.isActive ?? true,
      },
    });
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async update(@Param('id') id: string, @Body() body: { nameAr?: string; nameEn?: string; isActive?: boolean }) {
    return this.prisma.building.update({
      where: { id: parseInt(id) },
      data: {
        ...(body.nameAr !== undefined && { nameAr: body.nameAr }),
        ...(body.nameEn !== undefined && { nameEn: body.nameEn }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async remove(@Param('id') id: string) {
    await this.prisma.building.delete({ where: { id: parseInt(id) } });
    return { message: 'Building deleted' };
  }
}
