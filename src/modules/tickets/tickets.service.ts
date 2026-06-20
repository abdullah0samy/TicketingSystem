import { Injectable, Inject, UnauthorizedException, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ALLOWED_TRANSITIONS, TICKET_PRIORITIES } from './workflow.constants';
import { calculateSLADeadline } from './sla.utils';
import { createTicketSchema, ticketSearchSchema } from '../../common/schemas/tickets.schema';
import { getCachedPermissions, setCachedPermissions } from '../../../src/core/permissionCache';
import { TicketGateway } from '../../gateways/ticket.gateway';

function normalizeArabic(s: string): string {
  return s.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[\u064B-\u065F]/g, '');
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TicketGateway) private readonly ticketGateway: TicketGateway,
  ) {}

  private async checkTicketPermission(
    userId: number, userRole: string, userDeptId: number | null,
    ticketDeptId: number, action: 'canChangeStatus' | 'canAssignTickets' | 'canTransferTickets' | 'canArchiveTickets',
    txClient: any = null,
  ): Promise<boolean> {
    if (userRole === 'super_admin') return true;
    if (!userDeptId || Number(userDeptId) !== ticketDeptId) return false;

    const db = txClient || this.prisma;
    const isTransactional = txClient !== null;

    if (!isTransactional) {
      const cached = getCachedPermissions(userId, Number(userDeptId));
      if (cached) {
        if (cached[action] !== null) return Boolean(cached[action]);
        if (action === 'canArchiveTickets') return userRole === 'supervisor';
        return true;
      }
    }

    const [userOverride, dept] = await Promise.all([
      db.userPermissionOverride.findUnique({ where: { userId } }),
      db.department.findUnique({ where: { id: Number(userDeptId) }, include: { defaultPermissions: true } }),
    ]);

    if (!isTransactional) {
      setCachedPermissions(userId, Number(userDeptId), {
        canChangeStatus: userOverride?.canChangeStatus ?? dept?.defaultPermissions?.canChangeStatus ?? null,
        canAssignTickets: userOverride?.canAssignTickets ?? dept?.defaultPermissions?.canAssignTickets ?? null,
        canTransferTickets: userOverride?.canTransferTickets ?? dept?.defaultPermissions?.canTransferTickets ?? null,
        canArchiveTickets: userOverride?.canArchiveTickets ?? dept?.defaultPermissions?.canArchiveTickets ?? null,
      });
    }

    if (userOverride && userOverride[action] !== null) return Boolean(userOverride[action]);
    if (dept?.defaultPermissions && dept.defaultPermissions[action] !== null) return Boolean(dept.defaultPermissions[action]);
    if (action === 'canArchiveTickets') return userRole === 'supervisor';
    return true;
  }

  private async generateTicketNumber(txClient: any): Promise<string> {
    const now = new Date();
    const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
    const prefix = 'TKT';

    const lastTicket = await txClient.ticket.findFirst({
      where: { ticketNumber: { startsWith: `${prefix}-${dateStr}-` } },
      orderBy: { ticketNumber: 'desc' },
    });

    let sequence = 1;
    if (lastTicket) {
      const parts = lastTicket.ticketNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1]);
      if (!isNaN(lastSeq)) sequence = lastSeq + 1;
    }
    return `${prefix}-${dateStr}-${sequence.toString().padStart(3, '0')}`;
  }

  // --- FORM DATA (for ticket creation form — accessible to all roles) ---
  async getFormData() {
    const [departments, buildings, floors, ticketTypes] = await Promise.all([
      this.prisma.department.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, nameAr: true, nameEn: true, deptType: true },
        orderBy: { nameEn: 'asc' },
      }),
      this.prisma.building.findMany({
        where: { isActive: true },
        select: { id: true, nameAr: true, nameEn: true },
        orderBy: { nameEn: 'asc' },
      }),
      this.prisma.floor.findMany({
        where: { isActive: true },
        select: { id: true, nameAr: true, nameEn: true, buildingId: true },
        orderBy: [{ buildingId: 'asc' }, { nameEn: 'asc' }],
      }),
      this.prisma.ticketType.findMany({
        where: { isActive: true },
        select: { id: true, nameAr: true, nameEn: true, departmentId: true, color: true },
        orderBy: { displayOrder: 'asc' },
      }),
    ]);
    return { departments, buildings, floors, ticketTypes };
  }

  // --- CREATE TICKET ---
  async create(userId: number, body: any) {
    const { subject, description, departmentId, ticketTypeId, priority, buildingId, floorId, assetId, roomExtension, creatorPhone, creatorExtension, attachments } = body;

    const [fullUser, targetDept, bld, flr] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, include: { department: true } }),
      this.prisma.department.findUnique({ where: { id: parseInt(departmentId) } }),
      buildingId && !isNaN(parseInt(buildingId)) ? this.prisma.building.findUnique({ where: { id: parseInt(buildingId) } }) : null,
      floorId && !isNaN(parseInt(floorId)) ? this.prisma.floor.findUnique({ where: { id: parseInt(floorId) } }) : null,
    ]);

    if (!fullUser) throw new NotFoundException({ message: 'User not found' });
    if (!targetDept) throw new NotFoundException({ message: 'Target department not found' });

    // C-6: Supervisors and agents can only create tickets for their own department
    if ((fullUser.role === 'supervisor' || fullUser.role === 'agent') && fullUser.departmentId !== parseInt(departmentId)) {
      throw new ForbiddenException({ message: 'You can only create tickets for your own department', code: 'CROSS_DEPT_FORBIDDEN' });
    }

    // F-1: Cross-validate building/floor combination
    if (buildingId && floorId && flr && flr.buildingId !== parseInt(buildingId)) {
      throw new BadRequestException({ message: 'Selected floor does not belong to the selected building', code: 'FLOOR_BUILDING_MISMATCH' });
    }

    const ticketType = ticketTypeId && !isNaN(parseInt(ticketTypeId))
      ? await this.prisma.ticketType.findUnique({ where: { id: parseInt(ticketTypeId) } })
      : null;
    const baseSlaHours = ticketType?.slaHours || targetDept.slaHours || 24;
    const slaDeadline = calculateSLADeadline(baseSlaHours, priority || 'normal');

    const MAX_RETRIES = 5;
    let ticket: any;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        ticket = await this.prisma.$transaction(async (tx) => {
          const tn = await this.generateTicketNumber(tx);
          return tx.ticket.create({
            data: {
              ticketNumber: tn, subject: subject || 'No Subject', description,
              departmentId: parseInt(departmentId),
              ticketTypeId: ticketTypeId && !isNaN(parseInt(ticketTypeId)) ? parseInt(ticketTypeId) : null,
              priority: priority || 'normal',
              buildingId: buildingId && !isNaN(parseInt(buildingId)) ? parseInt(buildingId) : null,
              buildingName: bld ? bld.nameEn : null,
              floorId: floorId && !isNaN(parseInt(floorId)) ? parseInt(floorId) : null,
              floorName: flr ? flr.nameEn : null,
              assetId: assetId && !isNaN(parseInt(assetId)) ? parseInt(assetId) : null,
              roomExtension, createdById: fullUser.id,
              creatorName: fullUser.fullNameEn || fullUser.fullNameAr,
              creatorPhone, creatorExtension,
              creatorDeptId: fullUser.departmentId, creatorDeptName: fullUser.department?.nameEn || null,
              status: 'pending', slaDeadline,
              attachments: attachments ? {
                create: attachments.map((a: any) => ({
                  uploadedById: fullUser.id, fileName: a.fileName, fileUrl: a.fileUrl,
                  fileSize: a.fileSize, mimeType: a.mimeType,
                  isVoiceNote: a.isVoiceNote ?? false, voiceDuration: a.voiceDuration ?? null,
                })),
              } : undefined,
              auditLogs: {
                create: { userId: fullUser.id, action: 'TICKET_CREATED', departmentId: parseInt(departmentId),
                  newData: { ticketNumber: tn, subject: subject || 'No Subject', departmentId: parseInt(departmentId),
                    priority: priority || 'normal', buildingName: bld ? bld.nameEn : null, floorName: flr ? flr.nameEn : null } },
              },
            },
          });
        });
        break;
      } catch (txError: any) {
        if (txError.code === 'P2002' && attempt < MAX_RETRIES - 1) continue;
        throw txError;
      }
    }

    this.ticketGateway.emitToDept(parseInt(departmentId), 'new-ticket', { id: ticket.id, ticketNumber: ticket.ticketNumber, subject: ticket.subject, priority: ticket.priority });
    return ticket;
  }

  // --- LIST MY TICKETS ---
  async findMy(userId: number, query: any) {
    const MAX_PAGE_SIZE = 100;
    const pageNum = Math.max(1, parseInt(query.page as string) || 1);
    const limitNum = Math.min(parseInt(query.limit as string) || 20, MAX_PAGE_SIZE);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { createdById: userId, isArchived: false };
    if (query.status && query.status !== 'all') where.status = query.status;
    if (query.search) {
      const searchStr = normalizeArabic(query.search as string);
      where.OR = [{ ticketNumber: { contains: searchStr } }, { subject: { contains: searchStr } }];
    }

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where, skip, take: limitNum, orderBy: { createdAt: 'desc' },
        include: { department: true, ticketType: true, assignedTo: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } } },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { tickets, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } };
  }

  // --- LIST DEPARTMENT TICKETS ---
  async findDepartment(userId: number, userRole: string, userDeptId: number | null, query: any) {
    if (!userDeptId && userRole !== 'super_admin') {
      throw new ForbiddenException({ message: 'User not assigned to any department' });
    }

    const MAX_PAGE_SIZE = 100;
    const pageNum = Math.max(1, parseInt(query.page as string) || 1);
    const limitNum = Math.min(parseInt(query.limit as string) || 50, MAX_PAGE_SIZE);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { departmentId: userRole === 'super_admin' ? undefined : userDeptId, isArchived: false };

    if (userRole !== 'super_admin' && userDeptId) {
      const userOverride = await this.prisma.userPermissionOverride.findUnique({ where: { userId } });
      let canViewAll = true;
      if (userOverride && userOverride.canViewAllDeptTickets !== null) {
        canViewAll = Boolean(userOverride.canViewAllDeptTickets);
      } else {
        const dept = await this.prisma.department.findUnique({ where: { id: Number(userDeptId) }, include: { defaultPermissions: true } });
        if (dept?.defaultPermissions && dept.defaultPermissions.canViewAllDeptTickets !== null) {
          canViewAll = Boolean(dept.defaultPermissions.canViewAllDeptTickets);
        }
      }
      if (!canViewAll) {
        where.OR = [{ assignedToId: userId }, { createdById: userId }];
      }
    }

    if (query.status && query.status !== 'all') where.status = query.status;
    if (query.priority && query.priority !== 'all') where.priority = query.priority;
    if (query.ticketTypeId && query.ticketTypeId !== 'all') where.ticketTypeId = parseInt(query.ticketTypeId as string);
    if (query.creatorName) where.creatorName = { contains: query.creatorName as string };
    if (query.agentId && query.agentId !== 'all') where.assignedToId = parseInt(query.agentId as string);

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate as string);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate as string);
    }

    if (query.search) {
      const searchStr = normalizeArabic(query.search as string);
      const searchCondition = { OR: [{ ticketNumber: { contains: searchStr } }, { subject: { contains: searchStr } }, { description: { contains: searchStr } }, { creatorName: { contains: searchStr } }] };
      if (where.OR) {
        const rbacOr = where.OR; delete where.OR;
        where.AND = [{ OR: rbacOr }, searchCondition];
      } else {
        where.OR = searchCondition.OR;
      }
    }

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where, skip, take: limitNum, orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } }, ticketType: true, assignedTo: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } } },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { tickets, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } };
  }

  // --- GLOBAL SEARCH ---
  async search(userId: number, userRole: string, userDeptId: number | null | undefined, query: any) {
    const q = query.q;
    const searchStr = normalizeArabic(q as string);
    const pageNum = parseInt(query.page as string) || 1;
    const limitNum = parseInt(query.limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const searchWhere: any = { OR: [{ ticketNumber: { contains: searchStr } }, { subject: { contains: searchStr } }, { description: { contains: searchStr } }, { creatorName: { contains: searchStr } }] };
    const where: any = userRole === 'super_admin'
      ? searchWhere
      : { AND: [searchWhere, { OR: [{ createdById: userId }, { departmentId: userDeptId }] }] };

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where, skip, take: limitNum, orderBy: { createdAt: 'desc' },
        include: { department: true, ticketType: true, createdBy: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } }, assignedTo: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } } },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { tickets, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } };
  }

  // --- LIST ARCHIVED TICKETS ---
  async findArchived(userId: number, userRole: string, userDeptId: number | null | undefined, query: any) {
    const MAX_PAGE_SIZE = 100;
    const pageNum = Math.max(1, parseInt(query.page as string) || 1);
    const limitNum = Math.min(parseInt(query.limit as string) || 20, MAX_PAGE_SIZE);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { isArchived: true };
    if (userRole !== 'super_admin') where.departmentId = userDeptId;

    if (query.search) {
      const searchStr = normalizeArabic(query.search as string);
      where.AND = [{ OR: [{ ticketNumber: { contains: searchStr } }, { subject: { contains: searchStr } }, { creatorName: { contains: searchStr } }] }];
    }

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where, skip, take: limitNum, orderBy: { archivedAt: 'desc' },
        include: { department: true, ticketType: true, createdBy: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } }, assignedTo: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } } },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { tickets, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } };
  }

  // --- LIST TRANSFERRED TICKETS ---
  async findTransferred(userId: number, userRole: string, userDeptId: number | null | undefined, query: any) {
    const MAX_PAGE_SIZE = 100;
    const pageNum = Math.max(1, parseInt(query.page as string) || 1);
    const limitNum = Math.min(parseInt(query.limit as string) || 20, MAX_PAGE_SIZE);
    const skip = (pageNum - 1) * limitNum;

    const deptId = userRole === 'super_admin' ? undefined : userDeptId;
    const where: any = {
      transfers: { some: deptId ? { OR: [{ toDepartmentId: deptId }, { fromDepartmentId: deptId }] } : undefined },
    };

    if (query.search) {
      const searchStr = normalizeArabic(query.search as string);
      where.AND = [{ OR: [{ ticketNumber: { contains: searchStr } }, { subject: { contains: searchStr } }, { creatorName: { contains: searchStr } }] }];
    }

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where, skip, take: limitNum, orderBy: { updatedAt: 'desc' },
        include: {
          department: true, ticketType: true,
          createdBy: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } },
          assignedTo: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } },
          transfers: { include: { fromDepartment: true, toDepartment: true, transferredBy: { select: { fullNameEn: true, fullNameAr: true } } }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    const ticketsWithDirection = tickets.map(t => ({
      ...t, transfers: t.transfers.map(tr => ({
        ...tr, direction: deptId && tr.toDepartmentId === deptId ? 'inbound' : 'outbound',
      })),
    }));

    return { tickets: ticketsWithDirection, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } };
  }

  // --- GET TICKET DETAILS ---
  async findById(ticketId: number, userId: number, userRole: string, userDeptId: number | null) {
    if (isNaN(ticketId)) throw new BadRequestException({ message: 'Invalid ticket ID' });

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        department: true, ticketType: true,
        createdBy: { select: { id: true, fullNameEn: true, fullNameAr: true, avatarUrl: true, badgeNumber: true } },
        assignedTo: { select: { id: true, fullNameEn: true, fullNameAr: true, avatarUrl: true } },
        attachments: true, asset: true,
        messages: { include: { sender: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } }, attachments: true }, orderBy: { createdAt: 'asc' } },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
        transfers: { include: { fromDepartment: true, toDepartment: true, transferredBy: { select: { fullNameEn: true, fullNameAr: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!ticket) throw new NotFoundException({ message: 'Ticket not found' });

    const isCreator = Number(ticket.createdById) === Number(userId);
    const isAssigned = ticket.assignedToId ? Number(ticket.assignedToId) === Number(userId) : false;
    const isDeptMember = userDeptId !== null && Number(ticket.departmentId) === Number(userDeptId);
    const isAdmin = userRole === 'super_admin';

    if (!isCreator && !isAssigned && !isDeptMember && !isAdmin) {
      throw new ForbiddenException({ message: 'Access denied to this ticket' });
    }

    // C-5: If user is a dept member but canViewAllDeptTickets=false, restrict to own assigned/created tickets
    if (isDeptMember && !isCreator && !isAssigned && !isAdmin) {
      const userOverride = await this.prisma.userPermissionOverride.findUnique({ where: { userId } });
      let canViewAll = true;
      if (userOverride && userOverride.canViewAllDeptTickets !== null) {
        canViewAll = Boolean(userOverride.canViewAllDeptTickets);
      } else {
        const dept = await this.prisma.department.findUnique({ where: { id: Number(userDeptId) }, include: { defaultPermissions: true } });
        if (dept?.defaultPermissions && dept.defaultPermissions.canViewAllDeptTickets !== null) {
          canViewAll = Boolean(dept.defaultPermissions.canViewAllDeptTickets);
        }
      }
      if (!canViewAll) {
        throw new ForbiddenException({ message: 'Access denied to this ticket' });
      }
    }

    return ticket;
  }

  // --- UPDATE STATUS ---
  async updateStatus(ticketId: number, userId: number, userRole: string, userDeptId: number | null, userFullName: string | undefined, body: any) {
    const { status, comment, ticketTypeId, requiresExternalResource, externalResourceCost, externalResourceNote } = body;

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException({ message: 'Ticket not found' });

    if ((ticket.status === 'closed' || ticket.status === 'resolved') && userRole !== 'super_admin') {
      throw new ForbiddenException({ message: 'Ticket is locked. Only Super Admin can modify closed or resolved tickets via this endpoint.' });
    }

    const hasPermission = await this.checkTicketPermission(userId, userRole, userDeptId ? Number(userDeptId) : null, ticket.departmentId, 'canChangeStatus');
    if (!hasPermission) throw new ForbiddenException({ message: 'You do not have permission to update ticket status' });

    const oldStatus = ticket.status;
    const allowed = ALLOWED_TRANSITIONS[oldStatus] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException({ message: `Invalid status transition: ${oldStatus} → ${status}`, code: 'INVALID_TRANSITION', allowedTransitions: allowed });
    }

    if (ticket.status === 'closed' && status === 'in_progress' && userRole !== 'super_admin') {
      throw new ForbiddenException({ message: 'Only Super Admin can reopen a closed ticket', code: 'REOPEN_FORBIDDEN' });
    }

    if (status === 'resolved' && !ticket.assignedToId) {
      throw new BadRequestException({ message: 'A ticket must be assigned to an agent before it can be resolved', code: 'ASSIGNMENT_REQUIRED' });
    }

    const effectiveTypeId = ticketTypeId || ticket.ticketTypeId;
    if ((status === 'resolved' || status === 'closed') && !effectiveTypeId) {
      throw new BadRequestException({ message: 'Issue Type must be selected before resolving or closing the ticket', code: 'ISSUE_TYPE_REQUIRED' });
    }

    const isReopen = (oldStatus === 'resolved' || oldStatus === 'closed') && status === 'in_progress';

    const updatedTicket = await this.prisma.$transaction(async (tx) => {
      let slaUpdate: any = {};
      if (ticketTypeId && ticketTypeId !== ticket.ticketTypeId) {
        const newType = await tx.ticketType.findUnique({ where: { id: parseInt(ticketTypeId) } });
        const baseSlaHours = newType?.slaHours || 24;
        slaUpdate = { slaDeadline: calculateSLADeadline(baseSlaHours, ticket.priority as any) };
      }

      const t = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status, ticketTypeId: effectiveTypeId || undefined,
          requiresExternalResource: (status === 'resolved' || status === 'closed') && requiresExternalResource !== undefined ? requiresExternalResource : undefined,
          externalResourceCost: (status === 'resolved' || status === 'closed') && externalResourceCost !== undefined ? parseFloat(externalResourceCost) : undefined,
          externalResourceNote: (status === 'resolved' || status === 'closed') && externalResourceNote !== undefined ? externalResourceNote : undefined,
          completedAt: isReopen ? null : (status === 'resolved' ? new Date() : ticket.completedAt),
          closedAt: isReopen ? null : (status === 'closed' ? new Date() : ticket.closedAt),
          ...slaUpdate,
        },
      });

      await tx.auditLog.create({
        data: {
          ticketId: t.id, userId, action: isReopen ? 'TICKET_REOPENED' : 'STATUS_CHANGED',
          departmentId: t.departmentId, oldData: { from: oldStatus },
          newData: { to: status, comment: comment || null, ticketTypeId: effectiveTypeId || null,
            requiresExternalResource: requiresExternalResource || false,
            externalResourceCost: externalResourceCost || null,
            externalResourceNote: externalResourceNote || null,
            performedBy: userFullName, timestamp: new Date().toISOString() },
        },
      });

      if (comment) {
        await tx.ticketMessage.create({ data: { ticketId: t.id, senderId: userId, body: comment, messageType: 'note' } });
      }

      return t;
    });

    this.ticketGateway.emitToUser(ticket.createdById, 'ticket-status-updated', { id: ticket.id, ticketNumber: ticket.ticketNumber, status });
    this.ticketGateway.emitToDept(ticket.departmentId, 'ticket-status-updated', { id: ticket.id, ticketNumber: ticket.ticketNumber, status });
    this.ticketGateway.emitToTicket(ticket.id, 'ticket-status-updated', { id: ticket.id, status });

    return updatedTicket;
  }

  // --- ASSIGN TICKET ---
  async assign(ticketId: number, userId: number, userRole: string, userDeptId: number | null, userFullName: string | undefined, body: any) {
    const { agentId } = body;

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException({ message: 'Ticket not found' });

    if ((ticket.status === 'closed' || ticket.status === 'resolved') && userRole !== 'super_admin') {
      throw new ForbiddenException({ message: 'Closed or resolved tickets cannot be modified' });
    }

    const hasPermission = await this.checkTicketPermission(userId, userRole, userDeptId ? Number(userDeptId) : null, ticket.departmentId, 'canAssignTickets');
    if (!hasPermission) throw new ForbiddenException({ message: 'You do not have permission to assign tickets' });

    if (agentId) {
      const agent = await this.prisma.user.findUnique({ where: { id: parseInt(agentId) } });
      if (!agent) throw new NotFoundException({ message: 'Agent not found' });
      if (!agent.isActive) throw new BadRequestException({ message: 'Cannot assign ticket to an inactive agent' });
      if (agent.departmentId !== ticket.departmentId && userRole !== 'super_admin') {
        throw new BadRequestException({ message: 'Agent must belong to the same department as the ticket' });
      }
    }

    const updatedTicket = await this.prisma.$transaction(async (tx) => {
      const oldAssignedTo = ticket.assignedToId ? await tx.user.findUnique({ where: { id: ticket.assignedToId } }) : null;
      const newAssignedTo = agentId ? await tx.user.findUnique({ where: { id: parseInt(agentId) } }) : null;

      const t = await tx.ticket.update({
        where: { id: ticketId },
        data: { assignedToId: agentId ? parseInt(agentId) : null, status: ticket.status === 'pending' ? 'in_progress' : ticket.status },
      });

      await tx.auditLog.create({
        data: {
          ticketId: t.id, userId, action: 'ASSIGNED', departmentId: t.departmentId,
          oldData: { fromId: ticket.assignedToId, fromName: oldAssignedTo?.fullNameEn || null },
          newData: { toId: agentId ? parseInt(agentId) : null, toName: newAssignedTo?.fullNameEn || null, performedBy: userFullName, timestamp: new Date().toISOString() },
        },
      });

      return t;
    });

    if (agentId) {
      this.ticketGateway.emitToUser(parseInt(agentId), 'ticket-assigned', { id: ticket.id, ticketNumber: ticket.ticketNumber, subject: ticket.subject });
    }
    this.ticketGateway.emitToTicket(ticket.id, 'ticket-assigned', { id: ticket.id });

    return updatedTicket;
  }

  // --- TRANSFER TICKET ---
  async transfer(ticketId: number, userId: number, userRole: string, userDeptId: number | null, userFullName: string | undefined, body: any) {
    const { targetDeptId, reason } = body;
    if (!targetDeptId) throw new BadRequestException({ message: 'Target department is required' });

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException({ message: 'Ticket not found' });

    if ((ticket.status === 'closed' || ticket.status === 'resolved') && userRole !== 'super_admin') {
      throw new ForbiddenException({ message: 'Closed or resolved tickets cannot be modified' });
    }

    const hasPermission = await this.checkTicketPermission(userId, userRole, userDeptId ? Number(userDeptId) : null, ticket.departmentId, 'canTransferTickets');
    if (!hasPermission) throw new ForbiddenException({ message: 'You do not have permission to transfer tickets' });

    const targetDept = await this.prisma.department.findUnique({ where: { id: parseInt(targetDeptId) } });
    if (!targetDept) throw new NotFoundException({ message: 'Target department not found' });

    if (userRole !== 'super_admin') {
      const allowed = await this.prisma.deptTransferAllowlist.findFirst({
        where: { sourceDeptId: ticket.departmentId, targetDeptId: parseInt(targetDeptId), isActive: true },
      });
      if (!allowed) {
        throw new ForbiddenException({ message: 'This department is not on the allowed transfer list for your department', code: 'TRANSFER_NOT_ALLOWED' });
      }
    }

    const oldDeptId = ticket.departmentId;

    const updatedTicket = await this.prisma.$transaction(async (tx) => {
      const oldDept = await tx.department.findUnique({ where: { id: oldDeptId } });

      await tx.ticketTransfer.create({
        data: { ticketId: ticket.id, transferredById: userId, fromDepartmentId: oldDeptId, toDepartmentId: parseInt(targetDeptId), reason },
      });

      const slaHours = targetDept.slaHours || 24;
      const newSlaDeadline = calculateSLADeadline(slaHours, ticket.priority as any);

      const t = await tx.ticket.update({
        where: { id: ticket.id },
        data: { departmentId: parseInt(targetDeptId), assignedToId: null, status: 'pending', slaDeadline: newSlaDeadline },
      });

      await tx.auditLog.create({
        data: {
          ticketId: t.id, userId, action: 'TRANSFERRED', departmentId: t.departmentId,
          oldData: { fromDeptId: oldDeptId, fromDeptName: oldDept?.nameEn },
          newData: { toDeptId: parseInt(targetDeptId), toDeptName: targetDept.nameEn, reason: reason || null, performedBy: userFullName, timestamp: new Date().toISOString() },
        },
      });

      return t;
    });

    // C-7: Notify BOTH source and destination departments on transfer
    this.ticketGateway.emitToDept(parseInt(targetDeptId), 'new-ticket', { id: ticket.id, ticketNumber: ticket.ticketNumber, subject: ticket.subject, priority: ticket.priority });
    this.ticketGateway.emitToDept(oldDeptId, 'ticket-transferred', { id: ticket.id, ticketNumber: ticket.ticketNumber, toDepartmentId: parseInt(targetDeptId), reason });
    return updatedTicket;
  }

  // --- ADD COMMENT ---
  async addComment(ticketId: number, userId: number, userRole: string, userFullName: string | undefined, body: any) {
    const { content, isInternal, attachments } = body;
    if (!content && (!attachments || attachments.length === 0)) {
      throw new BadRequestException({ message: 'Comment content or attachment is required' });
    }

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException({ message: 'Ticket not found' });

    if (ticket.status === 'closed' && userRole !== 'super_admin') {
      throw new ForbiddenException({ message: 'Closed tickets are locked. Only Super Admin can add comments.' });
    }
    if (ticket.status === 'resolved' && userRole === 'end_user' && ticket.createdById !== userId) {
      throw new ForbiddenException({ message: 'Resolved tickets can only be commented on by the assigned team or the ticket creator.' });
    }

    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId, senderId: userId, body: content,
        messageType: isInternal ? 'internal_note' : 'public',
        attachments: attachments ? {
          create: attachments.map((a: any) => ({
            uploadedById: userId, fileName: a.fileName, fileUrl: a.fileUrl,
            fileSize: a.fileSize, mimeType: a.mimeType,
            isVoiceNote: a.isVoiceNote ?? false, voiceDuration: a.voiceDuration ?? null,
          })),
        } : undefined,
      },
      include: { sender: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } }, attachments: true },
    });

    if (!ticket.firstResponseAt) {
      const senderIsAgent = userRole === 'agent' || userRole === 'supervisor' || userRole === 'super_admin';
      const senderIsCreator = Number(ticket.createdById) === Number(userId);
      if (senderIsAgent && !senderIsCreator) {
        await this.prisma.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: message.createdAt } });
      }
    }

    const eventData = { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, message: { id: message.id, body: message.body, sender: message.sender, createdAt: message.createdAt, messageType: message.messageType } };
    this.ticketGateway.emitToDept(ticket.departmentId, 'new-comment', eventData);
    if (ticket.createdById !== userId) this.ticketGateway.emitToUser(ticket.createdById, 'new-comment', eventData);
    if (ticket.assignedToId && ticket.assignedToId !== userId) this.ticketGateway.emitToUser(ticket.assignedToId, 'new-comment', eventData);

    return message;
  }

  // --- CONFIRM RESOLUTION ---
  async confirmResolution(ticketId: number, userId: number, userFullName: string | undefined, body: any) {
    const { rating, feedback } = body;

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException({ message: 'Ticket not found' });

    if (Number(ticket.createdById) !== Number(userId)) {
      throw new ForbiddenException({ message: 'Only the ticket creator can confirm resolution' });
    }
    if (ticket.status !== 'resolved') {
      throw new BadRequestException({ message: 'Ticket must be in resolved status to confirm' });
    }

    const updatedTicket = await this.prisma.$transaction(async (tx) => {
      const t = await tx.ticket.update({
        where: { id: ticketId },
        data: { status: 'closed', closedAt: new Date(), rating: rating ? parseInt(rating) : undefined, feedback: feedback || undefined },
      });

      await tx.auditLog.create({
        data: {
          ticketId: t.id, userId, action: 'USER_CONFIRMATION', departmentId: t.departmentId,
          oldData: { from: 'resolved' },
          newData: { to: 'closed', rating, feedback, performedBy: userFullName, timestamp: new Date().toISOString() },
        },
      });

      if (feedback) {
        await tx.ticketMessage.create({
          data: { ticketId: t.id, senderId: userId, body: `User Feedback: ${feedback}${rating ? ` (Rating: ${rating}/5)` : ''}`, messageType: 'public' },
        });
      }

      return t;
    });

    this.ticketGateway.emitToDept(ticket.departmentId, 'ticket-closed', { id: ticket.id, ticketNumber: ticket.ticketNumber, status: 'closed' });
    return updatedTicket;
  }

  // --- BULK UPDATE STATUS ---
  async bulkUpdateStatus(userId: number, userRole: string, userDeptId: number | null, body: any, userFullName?: string) {
    const { ticketIds, status, comment } = body;
    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      throw new BadRequestException({ message: 'No tickets selected' });
    }

    const results = await this.prisma.$transaction(async (tx) => {
      const updated: any[] = [];
      for (const id of ticketIds) {
        const ticket = await tx.ticket.findUnique({ where: { id } });
        if (!ticket) continue;

        const hasPermission = await this.checkTicketPermission(userId, userRole, userDeptId ? Number(userDeptId) : null, ticket.departmentId, 'canChangeStatus', tx);
        if (!hasPermission) continue;

        const oldStatus = ticket.status;
        const allowed = ALLOWED_TRANSITIONS[oldStatus] || [];
        if (!allowed.includes(status) && userRole !== 'super_admin') continue;

        if (status === 'resolved' && !ticket.assignedToId) continue;
        if ((status === 'resolved' || status === 'closed') && !ticket.ticketTypeId) continue;

        const t = await tx.ticket.update({
          where: { id },
          data: { status, completedAt: status === 'resolved' ? new Date() : ticket.completedAt, closedAt: status === 'closed' ? new Date() : ticket.closedAt },
        });

        await tx.auditLog.create({
          data: { ticketId: t.id, userId, action: 'STATUS_CHANGED', departmentId: t.departmentId,
            oldData: { from: oldStatus }, newData: { to: status, comment: comment || 'Bulk update', performedBy: userFullName || 'Bulk', timestamp: new Date().toISOString() } },
        });

        updated.push(t);
      }
      return updated;
    });

    for (const t of results) {
      this.ticketGateway.emitToTicket(t.id, 'ticket-status-updated', { id: t.id, ticketNumber: t.ticketNumber, status });
      if (t.createdById) this.ticketGateway.emitToUser(t.createdById, 'ticket-status-updated', { id: t.id, ticketNumber: t.ticketNumber, status });
    }

    return { message: `Successfully updated ${results.length} tickets`, count: results.length };
  }

  // --- BULK ASSIGN ---
  async bulkAssign(userId: number, userRole: string, userDeptId: number | null, body: any, userFullName?: string) {
    const { ticketIds, agentId } = body;
    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      throw new BadRequestException({ message: 'No tickets selected' });
    }

    const newAssignedTo = agentId ? await this.prisma.user.findUnique({ where: { id: parseInt(agentId) } }) : null;

    const results = await this.prisma.$transaction(async (tx) => {
      const updated: any[] = [];
      for (const id of ticketIds) {
        const ticket = await tx.ticket.findUnique({ where: { id } });
        if (!ticket) continue;

        const hasPermission = await this.checkTicketPermission(userId, userRole, userDeptId ? Number(userDeptId) : null, ticket.departmentId, 'canAssignTickets', tx);
        if (!hasPermission) continue;

        if (newAssignedTo && newAssignedTo.departmentId !== ticket.departmentId) {
          throw new BadRequestException(`Agent (Dept ${newAssignedTo.departmentId}) does not belong to Ticket ${ticket.ticketNumber}'s department (${ticket.departmentId})`);
        }

        const oldAssignedToId = ticket.assignedToId;
        const oldAssignedTo = oldAssignedToId ? await tx.user.findUnique({ where: { id: oldAssignedToId } }) : null;

        const t = await tx.ticket.update({
          where: { id },
          data: { assignedToId: agentId ? parseInt(agentId) : null, status: ticket.status === 'pending' ? 'in_progress' : ticket.status },
        });

        await tx.auditLog.create({
          data: { ticketId: t.id, userId, action: 'ASSIGNED', departmentId: t.departmentId,
            oldData: { fromId: oldAssignedToId, fromName: oldAssignedTo?.fullNameEn || null },
            newData: { toId: agentId ? parseInt(agentId) : null, toName: newAssignedTo?.fullNameEn || null, performedBy: userFullName || 'Bulk', timestamp: new Date().toISOString() } },
        });

        updated.push(t);
      }
      return updated;
    });

    for (const t of results) {
      this.ticketGateway.emitToTicket(t.id, 'ticket-assigned', { id: t.id, ticketNumber: t.ticketNumber });
      if (t.createdById) this.ticketGateway.emitToUser(t.createdById, 'ticket-assigned', { id: t.id, ticketNumber: t.ticketNumber });
    }

    return { message: `Successfully assigned ${results.length} tickets`, count: results.length };
  }

  // --- UPDATE DUE DATE ---
  async updateDueDate(ticketId: number, userId: number, userRole: string, userDeptId: number | null, body: any, userFullName?: string) {
    const { dueDate } = body;

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException({ message: 'Ticket not found' });

    if ((ticket.status === 'closed' || ticket.status === 'resolved') && userRole !== 'super_admin') {
      throw new ForbiddenException({ message: 'Closed or resolved tickets cannot be modified' });
    }

    const uDeptId = userDeptId ? Number(userDeptId) : null;
    if (uDeptId !== Number(ticket.departmentId) && userRole !== 'super_admin') {
      throw new ForbiddenException({ message: 'Only department agents can update due date' });
    }

    const oldDueDate = ticket.dueDate;
    const updatedTicket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { dueDate: dueDate ? new Date(dueDate) : null },
    });

    await this.prisma.auditLog.create({
      data: { ticketId: updatedTicket.id, userId, action: 'DUE_DATE_CHANGED', departmentId: updatedTicket.departmentId,
        oldData: { from: oldDueDate }, newData: { to: updatedTicket.dueDate, performedBy: userFullName || 'User', timestamp: new Date().toISOString() } },
    });

    return updatedTicket;
  }

  // --- UPDATE TICKET TYPE ---
  async updateTicketType(ticketId: number, userId: number, userRole: string, userDeptId: number | null, body: any, userFullName?: string) {
    const { ticketTypeId } = body;

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException({ message: 'Ticket not found' });

    if ((ticket.status === 'closed' || ticket.status === 'resolved') && userRole !== 'super_admin') {
      throw new ForbiddenException({ message: 'Closed or resolved tickets cannot be modified' });
    }

    const uDeptId = userDeptId ? Number(userDeptId) : null;
    if (uDeptId !== Number(ticket.departmentId) && userRole !== 'super_admin') {
      throw new ForbiddenException({ message: 'Only department agents can update issue type' });
    }

    const oldTypeId = ticket.ticketTypeId;
    const oldType = oldTypeId ? await this.prisma.ticketType.findUnique({ where: { id: oldTypeId } }) : null;
    const newType = ticketTypeId ? await this.prisma.ticketType.findUnique({ where: { id: parseInt(ticketTypeId) } }) : null;

    const baseSlaHours = newType?.slaHours || 24;
    const newSlaDeadline = calculateSLADeadline(baseSlaHours, ticket.priority as any);

    const updatedTicket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { ticketTypeId: ticketTypeId ? parseInt(ticketTypeId) : null, slaDeadline: newSlaDeadline },
      include: { ticketType: true },
    });

    await this.prisma.auditLog.create({
      data: { ticketId: updatedTicket.id, userId, action: 'TYPE_CHANGED', departmentId: updatedTicket.departmentId,
        oldData: { from: oldType?.nameEn || 'None' }, newData: { to: newType?.nameEn || 'None', performedBy: userFullName || 'User', timestamp: new Date().toISOString() } },
    });

    return updatedTicket;
  }

  // --- LINK TICKETS ---
  async linkTickets(ticketId: number, userId: number, userRole: string, body: any, userFullName?: string) {
    const { targetTicketId } = body;

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    const target = await this.prisma.ticket.findUnique({ where: { id: parseInt(targetTicketId) } });
    if (!ticket || !target) throw new NotFoundException({ message: 'One or both tickets not found' });

    if ((ticket.status === 'closed' || ticket.status === 'resolved') && userRole !== 'super_admin') {
      throw new ForbiddenException({ message: 'Closed or resolved tickets cannot be modified' });
    }

    const currentRelated = ticket.relatedTickets ? JSON.parse(ticket.relatedTickets) : [];
    if (!currentRelated.includes(targetTicketId.toString())) currentRelated.push(targetTicketId.toString());
    await this.prisma.ticket.update({ where: { id: ticket.id }, data: { relatedTickets: JSON.stringify(currentRelated) } });

    const targetRelated = target.relatedTickets ? JSON.parse(target.relatedTickets) : [];
    if (!targetRelated.includes(ticketId.toString())) targetRelated.push(ticketId.toString());
    await this.prisma.ticket.update({ where: { id: target.id }, data: { relatedTickets: JSON.stringify(targetRelated) } });

    await this.prisma.auditLog.create({
      data: { ticketId: ticket.id, userId, action: 'TICKET_LINKED', departmentId: ticket.departmentId,
        newData: { targetId: target.id, targetNumber: target.ticketNumber, performedBy: userFullName || 'User', timestamp: new Date().toISOString() } },
    });

    return { message: 'Tickets linked successfully' };
  }

  // --- UNLINK TICKETS ---
  async unlinkTickets(ticketId: number, userId: number, userRole: string, body: any, userFullName?: string) {
    const { targetTicketId } = body;

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    const target = await this.prisma.ticket.findUnique({ where: { id: parseInt(targetTicketId) } });
    if (!ticket || !target) throw new NotFoundException({ message: 'One or both tickets not found' });

    if ((ticket.status === 'closed' || ticket.status === 'resolved') && userRole !== 'super_admin') {
      throw new ForbiddenException({ message: 'Closed or resolved tickets cannot be modified' });
    }

    const currentRelated = ticket.relatedTickets ? JSON.parse(ticket.relatedTickets) : [];
    const updatedRelated = currentRelated.filter((tid: string) => tid !== targetTicketId.toString());
    await this.prisma.ticket.update({ where: { id: ticket.id }, data: { relatedTickets: JSON.stringify(updatedRelated) } });

    const targetRelated = target.relatedTickets ? JSON.parse(target.relatedTickets) : [];
    const updatedTargetRelated = targetRelated.filter((tid: string) => tid !== ticketId.toString());
    await this.prisma.ticket.update({ where: { id: target.id }, data: { relatedTickets: JSON.stringify(updatedTargetRelated) } });

    await this.prisma.auditLog.create({
      data: { ticketId: ticket.id, userId, action: 'TICKET_UNLINKED', departmentId: ticket.departmentId,
        newData: { targetId: target.id, targetNumber: target.ticketNumber, performedBy: userFullName || 'User', timestamp: new Date().toISOString() } },
    });

    return { message: 'Tickets unlinked successfully' };
  }

  // --- ARCHIVE TICKET ---
  async archiveTicket(ticketId: number, userId: number, userRole: string, userDeptId: number | null, userFullName?: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException({ message: 'Ticket not found' });

    const hasPermission = await this.checkTicketPermission(userId, userRole, userDeptId ? Number(userDeptId) : null, ticket.departmentId, 'canArchiveTickets');
    if (!hasPermission) throw new ForbiddenException({ message: 'You do not have permission to archive this ticket' });

    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
      throw new BadRequestException({ message: 'Only resolved or closed tickets can be archived' });
    }

    const updatedTicket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { isArchived: true, archivedAt: new Date(), archivedById: userId },
    });

    await this.prisma.auditLog.create({
      data: { ticketId: updatedTicket.id, userId, action: 'TICKET_ARCHIVED', departmentId: updatedTicket.departmentId,
        newData: { performedBy: userFullName || 'User', timestamp: new Date().toISOString() } },
    });

    return updatedTicket;
  }

  // --- SUPER ADMIN OVERRIDE ---
  async superAdminOverride(ticketId: number, userId: number, userRole: string, updateData: any, userFullName?: string) {
    if (userRole !== 'super_admin') {
      throw new ForbiddenException({ message: 'Super Admin override required' });
    }

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException({ message: 'Ticket not found' });

    delete updateData.ticketNumber; delete updateData.id; delete updateData.createdAt;

    if (updateData.priority || updateData.ticketTypeId || updateData.departmentId) {
      const priority = updateData.priority || ticket.priority;
      const typeId = updateData.ticketTypeId !== undefined ? updateData.ticketTypeId : ticket.ticketTypeId;
      const deptId = updateData.departmentId !== undefined ? updateData.departmentId : ticket.departmentId;

      const [targetDept, ticketType] = await Promise.all([
        this.prisma.department.findUnique({ where: { id: parseInt(deptId) } }),
        typeId ? this.prisma.ticketType.findUnique({ where: { id: parseInt(typeId) } }) : null,
      ]);

      if (targetDept) {
        const baseSlaHours = ticketType?.slaHours || targetDept.slaHours || 24;
        updateData.slaDeadline = calculateSLADeadline(baseSlaHours, priority as any);
      }
    }

    const updatedTicket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: updateData,
    });

    await this.prisma.auditLog.create({
      data: { ticketId: updatedTicket.id, userId, action: 'SUPER_ADMIN_OVERRIDE', departmentId: updatedTicket.departmentId,
        oldData: ticket as any, newData: { updatedFields: Object.keys(updateData), performedBy: userFullName || 'Super Admin Override', timestamp: new Date().toISOString() } },
    });

    return updatedTicket;
  }

  // --- BULK ARCHIVE ---
  async bulkArchive(userId: number, userRole: string, userDeptId: number | null, body: any, userFullName?: string) {
    const { ticketIds } = body;
    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      throw new BadRequestException({ message: 'No tickets provided for archiving' });
    }

    const results = await this.prisma.$transaction(async (tx) => {
      const tickets = await tx.ticket.findMany({ where: { id: { in: ticketIds } } });
      const successfulIds: number[] = [];
      const failedIds: number[] = [];

      for (const ticket of tickets) {
        const hasPermission = await this.checkTicketPermission(userId, userRole, userDeptId ? Number(userDeptId) : null, ticket.departmentId, 'canArchiveTickets', tx);
        if (hasPermission) {
          if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
            failedIds.push(ticket.id); continue;
          }
          await tx.ticket.update({ where: { id: ticket.id }, data: { isArchived: true, archivedAt: new Date() } });
          await tx.auditLog.create({
            data: { ticketId: ticket.id, userId, action: 'TICKET_ARCHIVED_BULK', departmentId: ticket.departmentId,
              newData: { performedBy: userFullName || 'User', timestamp: new Date().toISOString() } },
          });
          successfulIds.push(ticket.id);
        } else {
          failedIds.push(ticket.id);
        }
      }
      return { successfulIds, failedIds };
    });

    return { message: `${results.successfulIds.length} tickets archived. ${results.failedIds.length} failed due to permissions.`, ...results };
  }
}
