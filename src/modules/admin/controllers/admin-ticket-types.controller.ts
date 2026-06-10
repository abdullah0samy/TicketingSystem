import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Inject, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin - Ticket Types')
@ApiBearerAuth()
@Controller('api/admin/ticket-types')
@UseGuards(JwtAuthGuard)
export class AdminTicketTypesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async findAll() {
    return this.prisma.ticketType.findMany({
      include: { department: true },
      orderBy: { displayOrder: 'asc' },
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async create(@Body() body: { nameAr: string; nameEn: string; departmentId?: number | string; color?: string; displayOrder?: number | string; isActive?: boolean; slaHours?: number | string | null }, @CurrentUser('id') userId: number) {
    if (!body.nameAr || !body.nameEn) {
      throw new BadRequestException({ message: 'Names are required' });
    }

    const ticketType = await this.prisma.ticketType.create({
      data: {
        nameAr: body.nameAr,
        nameEn: body.nameEn,
        departmentId: body.departmentId ? parseInt(body.departmentId as string) : undefined,
        color: body.color || '#6B7280',
        displayOrder: body.displayOrder ? parseInt(body.displayOrder as string) : 0,
        isActive: body.isActive ?? true,
        slaHours: body.slaHours !== undefined && body.slaHours !== null ? parseInt(body.slaHours as string) : undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'TICKET_TYPE_CREATED',
        newData: { nameEn: ticketType.nameEn, departmentId: ticketType.departmentId, slaHours: ticketType.slaHours }
      }
    });

    return ticketType;
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async update(@Param('id') id: string, @CurrentUser('id') userId: number, @Body() body: { nameAr?: string; nameEn?: string; departmentId?: number | string | null; color?: string; displayOrder?: number | string; isActive?: boolean; slaHours?: number | string | null }) {
    const oldType = await this.prisma.ticketType.findUnique({ where: { id: parseInt(id) } });
    const ticketType = await this.prisma.ticketType.update({
      where: { id: parseInt(id) },
      data: {
        ...(body.nameAr !== undefined && { nameAr: body.nameAr }),
        ...(body.nameEn !== undefined && { nameEn: body.nameEn }),
        ...(body.departmentId !== undefined && { departmentId: body.departmentId ? parseInt(body.departmentId as string) : null }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.displayOrder !== undefined && { displayOrder: parseInt(body.displayOrder as string) }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.slaHours !== undefined && { slaHours: body.slaHours ? parseInt(body.slaHours as string) : null }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'TICKET_TYPE_UPDATED',
        oldData: oldType ? { nameEn: oldType.nameEn, isActive: oldType.isActive } : undefined,
        newData: { nameEn: body.nameEn, isActive: body.isActive, slaHours: body.slaHours }
      }
    });

    return ticketType;
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async remove(@Param('id') id: string, @CurrentUser('id') userId: number) {
    const type = await this.prisma.ticketType.findUnique({ where: { id: parseInt(id) } });
    await this.prisma.ticketType.update({
      where: { id: parseInt(id) },
      data: { isActive: false },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'TICKET_TYPE_DEACTIVATED',
        oldData: type ? { nameEn: type.nameEn, id: type.id } : undefined
      }
    });

    return { message: 'Ticket type deactivated' };
  }
}
