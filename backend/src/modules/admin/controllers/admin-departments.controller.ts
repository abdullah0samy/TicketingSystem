import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Inject, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin - Departments')
@ApiBearerAuth()
@Controller('api/admin/departments')
@UseGuards(JwtAuthGuard)
export class AdminDepartmentsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'supervisor', 'agent')
  async findAll() {
    return this.prisma.department.findMany({
      include: { defaultPermissions: true, _count: { select: { users: true } } },
      orderBy: { nameEn: 'asc' },
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async create(@Body() body: { nameAr: string; nameEn: string; descriptionAr?: string; descriptionEn?: string; deptType?: string; isActive?: boolean; slaHours?: number | string }, @CurrentUser('id') userId: number) {
    if (!body.nameAr || !body.nameEn) {
      throw new BadRequestException({ message: 'Names are required' });
    }

    const permissions = await this.prisma.deptPermissions.create({ data: {} });

    const department = await this.prisma.department.create({
      data: {
        nameAr: body.nameAr,
        nameEn: body.nameEn,
        descriptionAr: body.descriptionAr,
        descriptionEn: body.descriptionEn,
        deptType: body.deptType || 'RECEIVER_ONLY',
        isActive: body.isActive ?? true,
        slaHours: body.slaHours ? parseInt(body.slaHours as string) : 24,
        defaultPermissionsId: permissions.id,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'DEPT_CREATED',
        entityType: 'DEPARTMENT',
        entityId: department.id,
        newData: { nameEn: department.nameEn, deptType: department.deptType, slaHours: department.slaHours }
      }
    });

    return department;
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async update(@Param('id') id: string, @CurrentUser('id') userId: number, @Body() body: any) {
    const oldDept = await this.prisma.department.findUnique({ where: { id: parseInt(id) } });

    const department = await this.prisma.department.update({
      where: { id: parseInt(id) },
      data: {
        ...(body.nameAr !== undefined && { nameAr: body.nameAr }),
        ...(body.nameEn !== undefined && { nameEn: body.nameEn }),
        ...(body.descriptionAr !== undefined && { descriptionAr: body.descriptionAr }),
        ...(body.descriptionEn !== undefined && { descriptionEn: body.descriptionEn }),
        ...(body.deptType !== undefined && { deptType: body.deptType }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.slaHours !== undefined && { slaHours: parseInt(body.slaHours as string) }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'DEPT_UPDATED',
        entityType: 'DEPARTMENT',
        entityId: department.id,
        oldData: oldDept ? { nameEn: oldDept.nameEn, isActive: oldDept.isActive } : undefined,
        newData: { nameEn: department.nameEn, isActive: department.isActive, deptType: department.deptType }
      }
    });

    return department;
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async remove(@Param('id') id: string, @CurrentUser('id') userId: number) {
    const department = await this.prisma.department.update({
      where: { id: parseInt(id) },
      data: { isActive: false, deletedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'DEPT_DEACTIVATED',
        entityType: 'DEPARTMENT',
        entityId: department.id
      }
    });

    return { message: 'Department deactivated' };
  }
}
