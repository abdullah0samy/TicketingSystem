import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin - Roles')
@ApiBearerAuth()
@Controller('api/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminRolesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('roles')
  async findAllRoles() {
    return this.prisma.role.findMany({
      include: { permissions: true, _count: { select: { users: true } } },
    });
  }

  @Post('roles')
  async createRole(@Body() body: { name: string; description?: string; permissionIds?: number[] }) {
    return this.prisma.role.create({
      data: {
        name: body.name,
        description: body.description,
        permissions: body.permissionIds ? { connect: body.permissionIds.map(id => ({ id })) } : undefined,
      },
      include: { permissions: true },
    });
  }

  @Put('roles/:id')
  async updateRole(@Param('id') id: string, @CurrentUser('id') userId: number, @Body() body: { name?: string; description?: string; permissionIds?: number[] }) {
    const oldRole = await this.prisma.role.findUnique({ where: { id: parseInt(id) } });
    const role = await this.prisma.role.update({
      where: { id: parseInt(id) },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.permissionIds !== undefined && { permissions: { set: body.permissionIds.map(id => ({ id })) } }),
      },
      include: { permissions: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'ROLE_UPDATED',
        entityType: 'ROLE',
        entityId: role.id,
        oldData: oldRole ? { name: oldRole.name } : undefined,
        newData: { name: body.name, permissionIds: body.permissionIds }
      }
    });

    return role;
  }

  @Delete('roles/:id')
  async removeRole(@Param('id') id: string, @CurrentUser('id') userId: number) {
    const role = await this.prisma.role.findUnique({
      where: { id: parseInt(id) },
      include: { _count: { select: { users: true } } },
    });

    if (!role) {
      throw new NotFoundException({ message: 'Role not found' });
    }

    if (role._count.users > 0) {
      throw new BadRequestException({ message: 'Cannot delete role with active users' });
    }

    await this.prisma.role.delete({ where: { id: parseInt(id) } });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'ROLE_DELETED',
        oldData: role ? { name: role.name } : undefined
      }
    });

    return { message: 'Role deleted' };
  }

  @Get('permissions')
  async findAllPermissions() {
    return this.prisma.permission.findMany();
  }
}
