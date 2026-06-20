import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Inject, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin - Floors')
@ApiBearerAuth()
@Controller('api/admin/floors')
@UseGuards(JwtAuthGuard)
export class AdminFloorsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'supervisor', 'agent')
  async findAll() {
    return this.prisma.floor.findMany({
      include: { building: true },
      orderBy: [{ buildingId: 'asc' }, { nameEn: 'asc' }],
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async create(@Body() body: { nameAr: string; nameEn: string; buildingId: number | string; isActive?: boolean }) {
    if (!body.nameAr || !body.nameEn || !body.buildingId) {
      throw new BadRequestException({ message: 'Required fields missing' });
    }
    return this.prisma.floor.create({
      data: {
        nameAr: body.nameAr,
        nameEn: body.nameEn,
        buildingId: parseInt(body.buildingId as string),
        isActive: body.isActive ?? true,
      },
    });
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async update(@Param('id') id: string, @Body() body: { nameAr?: string; nameEn?: string; buildingId?: number | string; isActive?: boolean }) {
    return this.prisma.floor.update({
      where: { id: parseInt(id) },
      data: {
        ...(body.nameAr !== undefined && { nameAr: body.nameAr }),
        ...(body.nameEn !== undefined && { nameEn: body.nameEn }),
        ...(body.buildingId !== undefined && { buildingId: parseInt(body.buildingId as string) }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async remove(@Param('id') id: string) {
    await this.prisma.floor.delete({ where: { id: parseInt(id) } });
    return { message: 'Floor deleted' };
  }
}
