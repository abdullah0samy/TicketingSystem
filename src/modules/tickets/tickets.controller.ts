import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, UseInterceptors, HttpCode, HttpStatus, Inject, Req, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TicketsService } from './tickets.service';
import { createTicketSchema } from '../../common/schemas/tickets.schema';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('api/tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(@Inject(TicketsService) private readonly ticketsService: TicketsService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ auth: {} })
  async create(@CurrentUser('id') userId: number, @Body() body: any) {
    const parsed = createTicketSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Validation failed', errors: parsed.error.issues });
    }
    return this.ticketsService.create(userId, parsed.data);
  }

  @Get('my')
  async findMy(@CurrentUser('id') userId: number, @Query() query: any) {
    return this.ticketsService.findMy(userId, query);
  }

  @Get('department')
  async findDepartment(@Req() req: any, @Query() query: any) {
    return this.ticketsService.findDepartment(req.user.id, req.user.role, req.user.departmentId ?? null, query);
  }

  @Get('search')
  @Throttle({ search: {} })
  async search(@Req() req: any, @Query() query: any) {
    return this.ticketsService.search(req.user.id, req.user.role, req.user.departmentId ?? null, query);
  }

  @Get('archived')
  async findArchived(@Req() req: any, @Query() query: any) {
    return this.ticketsService.findArchived(req.user.id, req.user.role, req.user.departmentId ?? null, query);
  }

  @Get('transferred')
  async findTransferred(@Req() req: any, @Query() query: any) {
    return this.ticketsService.findTransferred(req.user.id, req.user.role, req.user.departmentId ?? null, query);
  }

  @Get('form-data')
  async getFormData() {
    return this.ticketsService.getFormData();
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Req() req: any) {
    return this.ticketsService.findById(parseInt(id), req.user.id, req.user.role, req.user.departmentId ?? null);
  }

  @Put(':id/status')
  async updateStatus(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.ticketsService.updateStatus(parseInt(id), req.user.id, req.user.role, req.user.departmentId ?? null, req.user.fullNameEn, body);
  }

  @Post('bulk-update-status')
  async bulkUpdateStatus(@Req() req: any, @Body() body: any) {
    return this.ticketsService.bulkUpdateStatus(req.user.id, req.user.role, req.user.departmentId ?? null, body, req.user.fullNameEn);
  }

  @Put(':id/assign')
  async assign(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.ticketsService.assign(parseInt(id), req.user.id, req.user.role, req.user.departmentId ?? null, req.user.fullNameEn, body);
  }

  @Post('bulk-assign')
  async bulkAssign(@Req() req: any, @Body() body: any) {
    return this.ticketsService.bulkAssign(req.user.id, req.user.role, req.user.departmentId ?? null, body, req.user.fullNameEn);
  }

  @Put(':id/transfer')
  async transfer(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.ticketsService.transfer(parseInt(id), req.user.id, req.user.role, req.user.departmentId ?? null, req.user.fullNameEn, body);
  }

  @Post(':id/comments')
  @HttpCode(201)
  async addComment(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.ticketsService.addComment(parseInt(id), req.user.id, req.user.role, req.user.fullNameEn, body);
  }

  @Put(':id/confirm')
  async confirmResolution(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.ticketsService.confirmResolution(parseInt(id), req.user.id, req.user.fullNameEn, body);
  }

  @Put(':id/due-date')
  async updateDueDate(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.ticketsService.updateDueDate(parseInt(id), req.user.id, req.user.role, req.user.departmentId ?? null, body, req.user.fullNameEn);
  }

  @Put(':id/type')
  async updateTicketType(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.ticketsService.updateTicketType(parseInt(id), req.user.id, req.user.role, req.user.departmentId ?? null, body, req.user.fullNameEn);
  }

  @Post(':id/link')
  async linkTickets(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.ticketsService.linkTickets(parseInt(id), req.user.id, req.user.role, body, req.user.fullNameEn);
  }

  @Post(':id/unlink')
  async unlinkTickets(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.ticketsService.unlinkTickets(parseInt(id), req.user.id, req.user.role, body, req.user.fullNameEn);
  }

  @Put(':id/archive')
  async archiveTicket(@Param('id') id: string, @Req() req: any) {
    return this.ticketsService.archiveTicket(parseInt(id), req.user.id, req.user.role, req.user.departmentId ?? null, req.user.fullNameEn);
  }

  @Patch(':id')
  async superAdminOverride(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.ticketsService.superAdminOverride(parseInt(id), req.user.id, req.user.role, body, req.user.fullNameEn);
  }

  @Post('bulk-archive')
  async bulkArchive(@Req() req: any, @Body() body: any) {
    return this.ticketsService.bulkArchive(req.user.id, req.user.role, req.user.departmentId ?? null, body, req.user.fullNameEn);
  }
}
