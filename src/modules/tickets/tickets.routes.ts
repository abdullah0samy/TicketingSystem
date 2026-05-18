import express from 'express';
import type { Response } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../../core/db.ts';
import { authenticate, type AuthRequest } from '../../core/middleware/auth.middleware.ts';
import { emitToDept, emitToUser, emitToTicket } from '../../core/socket.ts';
import { ALLOWED_TRANSITIONS, TICKET_PRIORITIES } from './workflow.constants.ts';
import { calculateSLADeadline } from './sla.utils.ts';
import { validate, validateQuery } from '../../core/utils/api.utils.ts';
import { createTicketSchema, ticketSearchSchema } from './tickets.schema.ts';
import { getCachedPermissions, setCachedPermissions, invalidatePermissionCache } from '../../core/permissionCache.ts';

const router = express.Router();

const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 1000000,
  message: { message: 'Too many search requests. Please slow down.' }
});

// Apply authentication to all ticket routes
router.use(authenticate as any);

async function checkTicketPermission(
  userId: number,
  userRole: string,
  userDeptId: number | null,
  ticketDeptId: number,
  action: 'canChangeStatus' | 'canAssignTickets' | 'canTransferTickets' | 'canArchiveTickets',
  txClient: any = prisma
): Promise<boolean> {
  if (userRole === 'super_admin') return true;
  if (!userDeptId || Number(userDeptId) !== ticketDeptId) return false;

  // Use cache when not in a transaction
  const isTransactional = txClient !== prisma;
  if (!isTransactional) {
    const cached = getCachedPermissions(userId, Number(userDeptId));
    if (cached) {
      if (cached[action] !== null) return Boolean(cached[action]);
      if (action === 'canArchiveTickets') return userRole === 'supervisor';
      return true;
    }
  }

  const userOverride = await txClient.userPermissionOverride.findUnique({ where: { userId } });
  const dept = await txClient.department.findUnique({
    where: { id: Number(userDeptId) },
    include: { defaultPermissions: true }
  });

  // Cache combined result
  if (!isTransactional) {
    setCachedPermissions(userId, Number(userDeptId), {
      canChangeStatus: userOverride?.['canChangeStatus'] ?? dept?.defaultPermissions?.['canChangeStatus'] ?? null,
      canAssignTickets: userOverride?.['canAssignTickets'] ?? dept?.defaultPermissions?.['canAssignTickets'] ?? null,
      canTransferTickets: userOverride?.['canTransferTickets'] ?? dept?.defaultPermissions?.['canTransferTickets'] ?? null,
      canArchiveTickets: userOverride?.['canArchiveTickets'] ?? dept?.defaultPermissions?.['canArchiveTickets'] ?? null,
    });
  }

  if (userOverride && userOverride[action] !== null) return Boolean(userOverride[action]);
  if (dept?.defaultPermissions && dept.defaultPermissions[action] !== null) return Boolean(dept.defaultPermissions[action]);
  if (action === 'canArchiveTickets') return userRole === 'supervisor';
  return true; 
}

// --- TICKET NUMBER GENERATOR ---
// BUG FIX: Wrap in serializable transaction with retry to prevent race condition
async function generateTicketNumber(txClient: any = prisma): Promise<string> {
  const now = new Date();
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
  
  const prefix = 'TKT';
  
  const lastTicket = await txClient.ticket.findFirst({
    where: {
      ticketNumber: {
        startsWith: `${prefix}-${dateStr}-`
      }
    },
    orderBy: {
      ticketNumber: 'desc'
    }
  });

  let sequence = 1;
  if (lastTicket) {
    const parts = lastTicket.ticketNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1]);
    if (!isNaN(lastSeq)) {
      sequence = lastSeq + 1;
    }
  }

  return `${prefix}-${dateStr}-${sequence.toString().padStart(3, '0')}`;
}

// --- CREATE TICKET ---
/**
 * @openapi
 * /api/tickets:
 *   post:
 *     summary: Create a new ticket
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subject, departmentId]
 *             properties:
 *               subject: { type: string }
 *               description: { type: string }
 *               departmentId: { type: integer }
 *               priority: { type: string, enum: [low, normal, high, critical] }
 *     responses:
 *       201:
 *         description: Ticket created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ticket'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/', validate(createTicketSchema), async (req: AuthRequest, res: Response) => {
  const { 
    subject, 
    description, 
    departmentId, 
    ticketTypeId, 
    priority, 
    buildingId, 
    floorId, 
    assetId,
    roomExtension,
    creatorPhone,
    creatorExtension,
    attachments
  } = req.body;

  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

  try {
    // Fetch related names for denormalization (as per schema requirements)
    const [fullUser, targetDept, bld, flr] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id }, include: { department: true } }),
      prisma.department.findUnique({ where: { id: parseInt(departmentId) } }),
      buildingId && !isNaN(parseInt(buildingId)) ? prisma.building.findUnique({ where: { id: parseInt(buildingId) } }) : null,
      floorId && !isNaN(parseInt(floorId)) ? prisma.floor.findUnique({ where: { id: parseInt(floorId) } }) : null,
    ]);

    if (!fullUser) return res.status(404).json({ message: 'User not found' });
    if (!targetDept) return res.status(404).json({ message: 'Target department not found' });

    // Calculate SLA Deadline
    const ticketType = ticketTypeId && !isNaN(parseInt(ticketTypeId)) ? await prisma.ticketType.findUnique({ where: { id: parseInt(ticketTypeId) } }) : null;
    const baseSlaHours = ticketType?.slaHours || targetDept.slaHours || 24;
    const slaDeadline = calculateSLADeadline(baseSlaHours, (priority as any) || 'normal');

    // Race-condition-safe ticket creation: retry on unique constraint violation
    const MAX_RETRIES = 5;
    let ticket: any;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        ticket = await prisma.$transaction(async (tx) => {
          const tn = await generateTicketNumber(tx);
          return tx.ticket.create({
            data: {
              ticketNumber: tn,
              subject: subject || 'No Subject',
              description,
              departmentId: parseInt(departmentId),
              ticketTypeId: ticketTypeId && !isNaN(parseInt(ticketTypeId)) ? parseInt(ticketTypeId) : null,
              priority: priority || 'normal',
              buildingId: buildingId && !isNaN(parseInt(buildingId)) ? parseInt(buildingId) : null,
              buildingName: bld ? bld.nameEn : null,
              floorId: floorId && !isNaN(parseInt(floorId)) ? parseInt(floorId) : null,
              floorName: flr ? flr.nameEn : null,
              assetId: assetId && !isNaN(parseInt(assetId)) ? parseInt(assetId) : null,
              roomExtension,
              createdById: fullUser.id,
              creatorName: fullUser.fullNameEn || fullUser.fullNameAr,
              creatorPhone,
              creatorExtension,
              creatorDeptId: fullUser.departmentId,
              creatorDeptName: fullUser.department?.nameEn || null,
              status: 'pending',
              slaDeadline,
              attachments: attachments ? {
                create: attachments.map((a: any) => ({
                  uploadedById: fullUser.id,
                  fileName: a.fileName,
                  fileUrl: a.fileUrl,
                  fileSize: a.fileSize,
                  mimeType: a.mimeType,
                  isVoiceNote: a.isVoiceNote ?? false,
                  voiceDuration: a.voiceDuration ?? null
                }))
              } : undefined,
              auditLogs: {
                create: {
                  userId: fullUser.id,
                  action: 'TICKET_CREATED',
                  departmentId: parseInt(departmentId),
                  newData: {
                    ticketNumber: tn,
                    subject: subject || 'No Subject',
                    departmentId: parseInt(departmentId),
                    priority: priority || 'normal',
                    buildingName: bld ? bld.nameEn : null,
                    floorName: flr ? flr.nameEn : null
                  }
                }
              }
            }
          });
        });
        break;
      } catch (txError: any) {
        if (txError.code === 'P2002' && attempt < MAX_RETRIES - 1) continue;
        throw txError;
      }
    }

    // Emit real-time notification to department agents
    emitToDept(parseInt(departmentId), 'new-ticket', {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      priority: ticket.priority
    });

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ message: 'Error creating ticket' });
  }
});

// --- LIST MY TICKETS (PAGINATED) ---
router.get('/my', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

  const { page = '1', limit = '20', status, search } = req.query;
  
  // SECURITY FIX: Enforce maximum pagination limit to prevent DoS
  const MAX_PAGE_SIZE = 100;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(parseInt(limit as string) || 20, MAX_PAGE_SIZE);
  const skip = (pageNum - 1) * limitNum;

  const where: any = { createdById: req.user.id, isArchived: false };
  if (status && status !== 'all') where.status = status;
  if (search) {
    const searchStr = search as string;
    where.OR = [
      { ticketNumber: { contains: searchStr } },
      { subject: { contains: searchStr } }
    ];
  }

  try {
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          department: true,
          ticketType: true,
          assignedTo: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.ticket.count({ where })
    ]);

    res.json({
      tickets,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching your tickets:', error);
    res.status(500).json({ message: 'Error fetching your tickets' });
  }
});

// --- LIST DEPARTMENT TICKETS ---
/**
 * @openapi
 * /api/tickets/department:
 *   get:
 *     summary: List tickets for the user's department
 *     tags: [Tickets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated ticket list
 *       401:
 *         description: Unauthorized
 */
router.get('/department', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (!req.user.departmentId && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'User not assigned to any department' });
  }

  const { 
    status, 
    priority, 
    ticketTypeId, 
    search, 
    startDate, 
    endDate,
    page = '1',
    limit = '50',
    creatorName,
    agentId
  } = req.query;

  // SECURITY FIX: Enforce maximum pagination limit to prevent DoS
  const MAX_PAGE_SIZE = 100;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(parseInt(limit as string) || 50, MAX_PAGE_SIZE);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {
    departmentId: req.user.role === 'super_admin' ? undefined : req.user.departmentId,
    isArchived: false, // BUG FIX: Archived tickets must never appear in the active inbox
  };

  // RBAC: Check canViewAllDeptTickets — if false, restrict to own tickets only
  if (req.user.role !== 'super_admin' && req.user.departmentId) {
    const userOverride = await prisma.userPermissionOverride.findUnique({ where: { userId: req.user.id } });
    let canViewAll = true; // default
    if (userOverride && userOverride.canViewAllDeptTickets !== null) {
      canViewAll = Boolean(userOverride.canViewAllDeptTickets);
    } else {
      const dept = await prisma.department.findUnique({
        where: { id: Number(req.user.departmentId) },
        include: { defaultPermissions: true }
      });
      if (dept?.defaultPermissions && dept.defaultPermissions.canViewAllDeptTickets !== null) {
        canViewAll = Boolean(dept.defaultPermissions.canViewAllDeptTickets);
      }
    }
    if (!canViewAll) {
      where.OR = [
        { assignedToId: req.user.id },
        { createdById: req.user.id }
      ];
    }
  }

  if (status && status !== 'all') where.status = status;
  if (priority && priority !== 'all') where.priority = priority;
  if (ticketTypeId && ticketTypeId !== 'all') where.ticketTypeId = parseInt(ticketTypeId as string);
  if (creatorName) where.creatorName = { contains: creatorName as string };
  if (agentId && agentId !== 'all') where.assignedToId = parseInt(agentId as string);
  
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate as string);
    if (endDate) where.createdAt.lte = new Date(endDate as string);
  }

  // BUG FIX: search was overwriting RBAC OR clause from canViewAllDeptTickets check.
  // Merge using AND to preserve the access-control filter.
  if (search) {
    const searchStr = search as string;
    const searchCondition = {
      OR: [
        { ticketNumber: { contains: searchStr } },
        { subject: { contains: searchStr } },
        { description: { contains: searchStr } },
        { creatorName: { contains: searchStr } }
      ]
    };
    if (where.OR) {
      // RBAC OR exists, wrap both in AND
      const rbacOr = where.OR;
      delete where.OR;
      where.AND = [
        { OR: rbacOr },
        searchCondition
      ];
    } else {
      where.OR = searchCondition.OR;
    }
  }

  try {
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          createdBy: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } },
          ticketType: true,
          assignedTo: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.ticket.count({ where })
    ]);

    res.json({
      tickets,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching department tickets:', error);
    res.status(500).json({ message: 'Error fetching department tickets' });
  }
});

// --- GLOBAL SEARCH ---
router.get('/search', searchLimiter, validateQuery(ticketSearchSchema), async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  
  const { q, page = '1', limit = '20' } = req.query as any;

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const searchStr = q as string;

  // Base search criteria
  const searchWhere: any = {
    OR: [
      { ticketNumber: { contains: searchStr } },
      { subject: { contains: searchStr } },
      { description: { contains: searchStr } },
      { creatorName: { contains: searchStr } }
    ]
  };

  // Restrict search based on role: 
  // Super admins see all. 
  // Others see tickets they created OR tickets in their department.
  const where: any = req.user.role === 'super_admin' 
    ? searchWhere 
    : {
        AND: [
          searchWhere,
          {
            OR: [
              { createdById: req.user.id },
              { departmentId: req.user.departmentId }
            ]
          }
        ]
      };

  try {
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          department: true,
          ticketType: true,
          createdBy: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } },
          assignedTo: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string)
      }),
      prisma.ticket.count({ where })
    ]);

    res.json({
      tickets,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Error performing search' });
  }
});

// --- LIST ARCHIVED TICKETS ---
router.get('/archived', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

  const { page = '1', limit = '20', search } = req.query;
  const MAX_PAGE_SIZE = 100;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(parseInt(limit as string) || 20, MAX_PAGE_SIZE);
  const skip = (pageNum - 1) * limitNum;

  const where: any = { isArchived: true };

  if (req.user.role !== 'super_admin') {
    where.departmentId = req.user.departmentId;
  }

  if (search) {
    const searchStr = search as string;
    where.AND = [
      { OR: [
        { ticketNumber: { contains: searchStr } },
        { subject: { contains: searchStr } },
        { creatorName: { contains: searchStr } }
      ]}
    ];
  }

  try {
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          department: true,
          ticketType: true,
          createdBy: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } },
          assignedTo: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } }
        },
        orderBy: { archivedAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.ticket.count({ where })
    ]);

    res.json({
      tickets,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    console.error('Error fetching archived tickets:', error);
    res.status(500).json({ message: 'Error fetching archived tickets' });
  }
});

// --- LIST TRANSFERRED TICKETS (tickets transferred TO the current user's department) ---
router.get('/transferred', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

  const { page = '1', limit = '20', search } = req.query;
  const MAX_PAGE_SIZE = 100;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(parseInt(limit as string) || 20, MAX_PAGE_SIZE);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {
    transfers: {
      some: {
        toDepartmentId: req.user.role === 'super_admin' ? undefined : req.user.departmentId
      }
    }
  };

  if (search) {
    const searchStr = search as string;
    where.AND = [
      { OR: [
        { ticketNumber: { contains: searchStr } },
        { subject: { contains: searchStr } },
        { creatorName: { contains: searchStr } }
      ]}
    ];
  }

  try {
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          department: true,
          ticketType: true,
          createdBy: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } },
          assignedTo: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } },
          transfers: {
            include: {
              fromDepartment: true,
              toDepartment: true,
              transferredBy: { select: { fullNameEn: true, fullNameAr: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.ticket.count({ where })
    ]);

    res.json({
      tickets,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    console.error('Error fetching transferred tickets:', error);
    res.status(500).json({ message: 'Error fetching transferred tickets' });
  }
});

// --- GET TICKET DETAILS ---
/**
 * @openapi
 * /api/tickets/{id}:
 *   get:
 *     summary: Get ticket details by ID
 *     tags: [Tickets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ticket details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ticket'
 *       404:
 *         description: Ticket not found
 *       403:
 *         description: Access denied
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;
  const ticketId = parseInt(id);

  if (isNaN(ticketId)) {
    return res.status(400).json({ message: 'Invalid ticket ID' });
  }

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        department: true,
        ticketType: true,
        createdBy: { select: { id: true, fullNameEn: true, fullNameAr: true, avatarUrl: true, badgeNumber: true } },
        assignedTo: { select: { id: true, fullNameEn: true, fullNameAr: true, avatarUrl: true } },
        attachments: true,
        asset: true,
        messages: {
          include: {
            sender: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } },
            attachments: true
          },
          orderBy: { createdAt: 'asc' }
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20
        },
        transfers: {
          include: {
            fromDepartment: true,
            toDepartment: true,
            transferredBy: { select: { fullNameEn: true, fullNameAr: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    if (ticket.isArchived && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied: archived tickets are restricted to administrators' });
    }

    const userId = Number(req.user.id);
    const userDeptId = req.user.departmentId ? Number(req.user.departmentId) : null;
    
    const isCreator = Number(ticket.createdById) === userId;
    const isAssigned = ticket.assignedToId ? Number(ticket.assignedToId) === userId : false;
    const isDeptMember = userDeptId !== null && Number(ticket.departmentId) === userDeptId;
    const isAdmin = req.user.role === 'super_admin';

    if (!isCreator && !isAssigned && !isDeptMember && !isAdmin) {
      return res.status(403).json({ message: 'Access denied to this ticket' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket details:', error);
    res.status(500).json({ message: 'Error fetching ticket details' });
  }
});

// --- UPDATE TICKET STATUS ---
router.put('/:id/status', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;
  const { status, comment, ticketTypeId, requiresExternalResource, externalResourceCost, externalResourceNote } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: parseInt(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    // Lock check:
    // - 'closed': only super_admin can change status (creator confirmation already wrote 'closed')
    // - 'resolved': only super_admin can change status via this endpoint; creator uses /confirm
    if ((ticket.status === 'closed' || ticket.status === 'resolved') && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Ticket is locked. Only Super Admin can modify closed or resolved tickets via this endpoint.' });
    }

    // Check change status permissions
    const hasPermission = await checkTicketPermission(
      req.user.id,
      req.user.role,
      req.user.departmentId ? Number(req.user.departmentId) : null,
      ticket.departmentId,
      'canChangeStatus'
    );

    if (!hasPermission) {
      return res.status(403).json({ message: 'You do not have permission to update ticket status' });
    }

    const oldStatus = ticket.status;

    // WORKFLOW: Enforce valid status transitions
    const allowed = ALLOWED_TRANSITIONS[oldStatus] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        message: `Invalid status transition: ${oldStatus} → ${status}`,
        code: 'INVALID_TRANSITION',
        allowedTransitions: allowed
      });
    }

    // WORKFLOW: Reopen from 'closed' requires super_admin (guarded above, but double-check)
    if (ticket.status === 'closed' && status === 'in_progress' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        message: 'Only Super Admin can reopen a closed ticket',
        code: 'REOPEN_FORBIDDEN'
      });
    }

    // WORKFLOW: Must have an assigned agent before resolving
    if (status === 'resolved' && !ticket.assignedToId) {
      return res.status(400).json({
        message: 'A ticket must be assigned to an agent before it can be resolved',
        code: 'ASSIGNMENT_REQUIRED'
      });
    }

    // MANDATORY: Issue Type (ticketTypeId) must be set before resolving or closing
    // Allow setting it inline via the status update payload
    const effectiveTypeId = ticketTypeId || ticket.ticketTypeId;
    if ((status === 'resolved' || status === 'closed') && !effectiveTypeId) {
      return res.status(400).json({ 
        message: 'Issue Type must be selected before resolving or closing the ticket',
        code: 'ISSUE_TYPE_REQUIRED'
      });
    }

    // Determine timestamp updates
    const isReopen = (oldStatus === 'resolved' || oldStatus === 'closed') && status === 'in_progress';

    const updatedTicket = await prisma.$transaction(async (tx) => {
      // If ticketTypeId provided inline and differs from current, recalculate SLA
      let slaUpdate = {};
      if (ticketTypeId && ticketTypeId !== ticket.ticketTypeId) {
        const newType = await tx.ticketType.findUnique({ where: { id: parseInt(ticketTypeId) } });
        const baseSlaHours = newType?.slaHours || 24;
        slaUpdate = { slaDeadline: calculateSLADeadline(baseSlaHours, ticket.priority as any) };
      }

      const t = await tx.ticket.update({
        where: { id: parseInt(id) },
        data: { 
          status: status as any,
          ticketTypeId: effectiveTypeId || undefined,
          requiresExternalResource: (status === 'resolved' || status === 'closed') && requiresExternalResource !== undefined ? requiresExternalResource : undefined,
          externalResourceCost: (status === 'resolved' || status === 'closed') && externalResourceCost !== undefined
            ? (() => { const v = parseFloat(externalResourceCost); return isNaN(v) ? null : v; })()
            : undefined,
          externalResourceNote: (status === 'resolved' || status === 'closed') && externalResourceNote !== undefined ? externalResourceNote : undefined,
          // Set timestamps on resolve/close, nullify on reopen
          completedAt: isReopen ? null : (status === 'resolved' ? new Date() : ticket.completedAt),
          closedAt: isReopen ? null : (status === 'closed' ? new Date() : ticket.closedAt),
          ...slaUpdate
        }
      });

      // Create Audit Log
      await tx.auditLog.create({
        data: {
          ticketId: t.id,
          userId: req.user!.id,
          action: isReopen ? 'TICKET_REOPENED' : 'STATUS_CHANGED',
          departmentId: t.departmentId,
          oldData: { from: oldStatus },
          newData: { 
            to: status, 
            comment: comment || null,
            ticketTypeId: effectiveTypeId || null,
            requiresExternalResource: requiresExternalResource || false,
            externalResourceCost: externalResourceCost || null,
            externalResourceNote: externalResourceNote || null,
            performedBy: req.user!.fullNameEn,
            timestamp: new Date().toISOString()
          }
        }
      });

      // Add message if provided (as a note linked to audit log)
      if (comment) {
        await tx.ticketMessage.create({
          data: {
            ticketId: t.id,
            senderId: req.user!.id,
            body: comment,
            messageType: 'note'
          }
        });
      }

      return t;
    });

    // Notify creator
    emitToUser(ticket.createdById, 'ticket-status-updated', {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status
    });

    // Notify department agents
    emitToDept(ticket.departmentId, 'ticket-status-updated', {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status
    });

    // Notify ALL viewers currently in the ticket room
    emitToTicket(ticket.id, 'ticket-status-updated', {
      id: ticket.id,
      status
    });

    res.json(updatedTicket);
  } catch (error) {
    res.status(500).json({ message: 'Error updating status' });
  }
});

// --- ASSIGN TICKET ---
router.put('/:id/assign', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;
  const { agentId } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: parseInt(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    // Lock check: Only Super Admin can modify closed or resolved tickets
    if ((ticket.status === 'closed' || ticket.status === 'resolved') && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Closed or resolved tickets cannot be modified' });
    }

    // RBAC: Check canAssignTickets permission via overrides/department defaults
    const hasPermission = await checkTicketPermission(
      req.user.id,
      req.user.role,
      req.user.departmentId ? Number(req.user.departmentId) : null,
      ticket.departmentId,
      'canAssignTickets'
    );

    if (!hasPermission) {
      return res.status(403).json({ message: 'You do not have permission to assign tickets' });
    }

    // Agent Validation: Must exist and belong to the correct department (unless super_admin)
    if (agentId) {
      const agent = await prisma.user.findUnique({ where: { id: parseInt(agentId) } });
      if (!agent) return res.status(404).json({ message: 'Agent not found' });
      if (agent.departmentId !== ticket.departmentId && req.user.role !== 'super_admin') {
        return res.status(400).json({ message: 'Agent must belong to the same department as the ticket' });
      }
    }

    const updatedTicket = await prisma.$transaction(async (tx) => {
      const oldAssignedTo = ticket.assignedToId ? await tx.user.findUnique({ where: { id: ticket.assignedToId } }) : null;
      const newAssignedTo = agentId ? await tx.user.findUnique({ where: { id: parseInt(agentId) } }) : null;

      const t = await tx.ticket.update({
        where: { id: parseInt(id) },
        data: { 
          assignedToId: agentId ? parseInt(agentId) : null,
          status: ticket.status === 'pending' ? 'in_progress' : ticket.status
        }
      });

      await tx.auditLog.create({
        data: {
          ticketId: t.id,
          userId: req.user!.id,
          action: 'ASSIGNED',
          departmentId: t.departmentId,
          oldData: { 
            fromId: ticket.assignedToId,
            fromName: oldAssignedTo?.fullNameEn || null
          },
          newData: { 
            toId: agentId ? parseInt(agentId) : null,
            toName: newAssignedTo?.fullNameEn || null,
            performedBy: req.user!.fullNameEn,
            timestamp: new Date().toISOString()
          }
        }
      });

      return t;
    });

    // Notify agent if assigned
    if (agentId) {
      emitToUser(parseInt(agentId), 'ticket-assigned', {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject
      });
    }

    emitToTicket(ticket.id, 'ticket-assigned', { id: ticket.id });

    res.json(updatedTicket);
  } catch (error) {
    res.status(500).json({ message: 'Error assigning ticket' });
  }
});

// --- TRANSFER TICKET ---
router.put('/:id/transfer', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;
  const { targetDeptId, reason } = req.body;

  if (!targetDeptId) return res.status(400).json({ message: 'Target department is required' });

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: parseInt(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    // Lock check: Only Super Admin can modify closed or resolved tickets
    if ((ticket.status === 'closed' || ticket.status === 'resolved') && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Closed or resolved tickets cannot be modified' });
    }

    // Check transfer permissions
    const hasPermission = await checkTicketPermission(
      req.user.id,
      req.user.role,
      req.user.departmentId ? Number(req.user.departmentId) : null,
      ticket.departmentId,
      'canTransferTickets'
    );

    if (!hasPermission) {
      return res.status(403).json({ message: 'You do not have permission to transfer tickets' });
    }

    const targetDept = await prisma.department.findUnique({ where: { id: parseInt(targetDeptId) } });
    if (!targetDept) return res.status(404).json({ message: 'Target department not found' });

    // BUSINESS LOGIC: Enforce DeptTransferAllowlist if not super_admin
    if (req.user.role !== 'super_admin') {
      const allowed = await prisma.deptTransferAllowlist.findFirst({
        where: {
          sourceDeptId: ticket.departmentId,
          targetDeptId: parseInt(targetDeptId),
          isActive: true
        }
      });
      if (!allowed) {
        return res.status(403).json({ 
          message: 'This department is not on the allowed transfer list for your department',
          code: 'TRANSFER_NOT_ALLOWED'
        });
      }
    }

    const oldDeptId = ticket.departmentId;

    const updatedTicket = await prisma.$transaction(async (tx) => {
      const oldDept = await tx.department.findUnique({ where: { id: oldDeptId } });
      
      // Create Transfer Record
      await tx.ticketTransfer.create({
        data: {
          ticketId: ticket.id,
          transferredById: req.user!.id,
          fromDepartmentId: oldDeptId,
          toDepartmentId: parseInt(targetDeptId),
          reason
        }
      });

      // Calculate new SLA for target department
      const slaHours = targetDept.slaHours || 24;
      const newSlaDeadline = calculateSLADeadline(slaHours, ticket.priority as any);

      // Update Ticket
      const t = await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          departmentId: parseInt(targetDeptId),
          assignedToId: null, // Unassign when transferring
          status: 'pending', // Reset to pending in new department
          slaDeadline: newSlaDeadline
        }
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          ticketId: t.id,
          userId: req.user!.id,
          action: 'TRANSFERRED',
          departmentId: t.departmentId,
          oldData: { 
            fromDeptId: oldDeptId,
            fromDeptName: oldDept?.nameEn
          },
          newData: { 
            toDeptId: parseInt(targetDeptId),
            toDeptName: targetDept.nameEn,
            reason: reason || null,
            performedBy: req.user!.fullNameEn,
            timestamp: new Date().toISOString()
          }
        }
      });

      return t;
    });

    // Notify new department
    emitToDept(parseInt(targetDeptId), 'new-ticket', {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      priority: ticket.priority
    });

    res.json(updatedTicket);
  } catch (error) {
    res.status(500).json({ message: 'Error transferring ticket' });
  }
});

// --- ADD COMMENT (MESSAGE) ---
router.post('/:id/comments', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;
  const { content, isInternal, attachments } = req.body;

  if (!content && (!attachments || attachments.length === 0)) {
    return res.status(400).json({ message: 'Comment content or attachment is required' });
  }

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: parseInt(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    // Lock check for comments:
    // - 'closed' tickets: LOCKED for everyone except super_admin.
    // - 'resolved' tickets: agents and supervisors CAN still add notes (pre-confirmation period).
    //   Only the /confirm endpoint closes a resolved ticket.
    if (ticket.status === 'closed' && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Closed tickets are locked. Only Super Admin can add comments.' });
    }
    // For resolved tickets, block only end_users who are not the creator (agents/supervisors may comment)
    if (ticket.status === 'resolved' && req.user.role === 'end_user' && ticket.createdById !== req.user.id) {
      return res.status(403).json({ message: 'Resolved tickets can only be commented on by the assigned team or the ticket creator.' });
    }

    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.ticketMessage.create({
        data: {
          ticketId: parseInt(id),
          senderId: req.user.id,
          body: content,
          messageType: isInternal ? 'internal_note' : 'public',
          attachments: attachments ? {
            create: attachments.map((a: any) => ({
              uploadedById: req.user!.id,
              fileName: a.fileName,
              fileUrl: a.fileUrl,
              fileSize: a.fileSize,
              mimeType: a.mimeType,
              isVoiceNote: a.isVoiceNote ?? false,
              voiceDuration: a.voiceDuration ?? null
            }))
          } : undefined
        },
        include: {
          sender: { select: { fullNameEn: true, fullNameAr: true, avatarUrl: true } },
          attachments: true
        }
      });

      const senderIsAgent = req.user.role === 'agent' || req.user.role === 'supervisor' || req.user.role === 'super_admin';
      const senderIsCreator = ticket.createdById === req.user.id;
      if (!ticket.firstResponseAt && senderIsAgent && !senderIsCreator) {
        await tx.ticket.update({
          where: { id: parseInt(id) },
          data: { firstResponseAt: msg.createdAt }
        });
      }

      return msg;
    });

    // Real-time notification
    const eventData = {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      message: {
        id: message.id,
        body: message.body,
        sender: message.sender,
        createdAt: message.createdAt,
        messageType: message.messageType
      }
    };

    // Emit to department (agents)
    emitToDept(ticket.departmentId, 'new-comment', eventData);
    
    // Emit to creator (if not the one who commented)
    if (ticket.createdById !== req.user.id) {
      emitToUser(ticket.createdById, 'new-comment', eventData);
    }

    // Emit to assigned agent (if not the one who commented and not already covered by dept emit)
    if (ticket.assignedToId && ticket.assignedToId !== req.user.id) {
      emitToUser(ticket.assignedToId, 'new-comment', eventData);
    }

    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: 'Error adding comment' });
  }
});

// --- CONFIRM TICKET RESOLUTION (USER) ---
router.put('/:id/confirm', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;
  const { rating, feedback } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: parseInt(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    // Only creator can confirm
    if (ticket.createdById !== req.user.id) {
      return res.status(403).json({ message: 'Only the ticket creator can confirm resolution' });
    }

    if (ticket.status !== 'resolved') {
      return res.status(400).json({ message: 'Ticket must be in resolved status to confirm' });
    }

    const updatedTicket = await prisma.$transaction(async (tx) => {
      const t = await tx.ticket.update({
        where: { id: parseInt(id) },
        data: { 
          status: 'closed',
          closedAt: new Date(),
          rating: rating ? parseInt(rating) : undefined,
          feedback: feedback || undefined
        }
      });

      await tx.auditLog.create({
        data: {
          ticketId: t.id,
          userId: req.user!.id,
          action: 'USER_CONFIRMATION',
          departmentId: t.departmentId,
          oldData: { from: 'resolved' },
          newData: { 
            to: 'closed', 
            rating, 
            feedback,
            performedBy: req.user!.fullNameEn,
            timestamp: new Date().toISOString()
          }
        }
      });

      if (feedback) {
        await tx.ticketMessage.create({
          data: {
            ticketId: t.id,
            senderId: req.user!.id,
            body: `User Feedback: ${feedback}${rating ? ` (Rating: ${rating}/5)` : ''}`,
            messageType: 'public'
          }
        });
      }

      return t;
    });

    // Notify department agents
    emitToDept(ticket.departmentId, 'ticket-closed', {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: 'closed'
    });

    res.json(updatedTicket);
  } catch (error) {
    res.status(500).json({ message: 'Error confirming resolution' });
  }
});

// --- BULK UPDATE STATUS ---
router.post('/bulk-update-status', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { ticketIds, status, comment } = req.body;

  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    return res.status(400).json({ message: 'No tickets selected' });
  }

  try {
    const results = await prisma.$transaction(async (tx) => {
      const updated = [];
      for (const id of ticketIds) {
        const ticket = await tx.ticket.findUnique({ where: { id } });
        if (!ticket) continue;

        // Permission check
        const hasPermission = await checkTicketPermission(
          req.user!.id,
          req.user!.role,
          req.user!.departmentId ? Number(req.user!.departmentId) : null,
          ticket.departmentId,
          'canChangeStatus',
          tx
        );
        if (!hasPermission) continue;

        const oldStatus = ticket.status;
        
        // WORKFLOW: Enforce status transition
        const allowed = ALLOWED_TRANSITIONS[oldStatus] || [];
        if (!allowed.includes(status) && req.user!.role !== 'super_admin') {
          continue; // Skip invalid transitions in bulk
        }

        // BUG FIX: Bulk update must enforce the same resolve/close guards as single update
        if (status === 'resolved' && !ticket.assignedToId) {
          continue; // Skip: assignment required before resolving
        }
        if ((status === 'resolved' || status === 'closed') && !ticket.ticketTypeId) {
          continue; // Skip: issue type required before resolving/closing
        }

        const t = await tx.ticket.update({
          where: { id },
          data: { 
            status: status as any,
            completedAt: status === 'resolved' ? new Date() : ticket.completedAt,
            closedAt: status === 'closed' ? new Date() : ticket.closedAt
          }
        });

        await tx.auditLog.create({
          data: {
            ticketId: t.id,
            userId: req.user!.id,
            action: 'STATUS_CHANGED',
            departmentId: t.departmentId,
            oldData: { from: oldStatus },
            newData: { 
              to: status, 
              comment: comment || 'Bulk update',
              performedBy: req.user!.fullNameEn,
              timestamp: new Date().toISOString()
            }
          }
        });

        updated.push(t);
      }
      return updated;
    });

    // Emit real-time notifications for each updated ticket
    for (const t of results) {
      emitToTicket(t.id, 'ticket-status-updated', { id: t.id, ticketNumber: t.ticketNumber, status });
      if (t.createdById) emitToUser(t.createdById, 'ticket-status-updated', { id: t.id, ticketNumber: t.ticketNumber, status });
    }

    res.json({ message: `Successfully updated ${results.length} tickets`, count: results.length });
  } catch (error) {
    res.status(500).json({ message: 'Error performing bulk update' });
  }
});

// --- BULK ASSIGN ---
router.post('/bulk-assign', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { ticketIds, agentId } = req.body;

  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    return res.status(400).json({ message: 'No tickets selected' });
  }

  try {
    const newAssignedTo = agentId ? await prisma.user.findUnique({ where: { id: parseInt(agentId) } }) : null;

    const results = await prisma.$transaction(async (tx) => {
      const updated = [];
      for (const id of ticketIds) {
        const ticket = await tx.ticket.findUnique({ where: { id } });
        if (!ticket) continue;

        // Permission check
        const hasPermission = await checkTicketPermission(
          req.user!.id,
          req.user!.role,
          req.user!.departmentId ? Number(req.user!.departmentId) : null,
          ticket.departmentId,
          'canAssignTickets',
          tx
        );
        if (!hasPermission) continue;

        // Agent Validation (Bulk): Must belong to the ticket's department
        if (newAssignedTo && newAssignedTo.departmentId !== ticket.departmentId) {
          throw new Error(`Agent (Dept ${newAssignedTo.departmentId}) does not belong to Ticket ${ticket.ticketNumber}'s department (${ticket.departmentId})`);
        }

        const oldAssignedToId = ticket.assignedToId;
        const oldAssignedTo = oldAssignedToId ? await tx.user.findUnique({ where: { id: oldAssignedToId } }) : null;

        const t = await tx.ticket.update({
          where: { id },
          data: { 
            assignedToId: agentId ? parseInt(agentId) : null,
            status: ticket.status === 'pending' ? 'in_progress' : ticket.status
          }
        });

        await tx.auditLog.create({
          data: {
            ticketId: t.id,
            userId: req.user!.id,
            action: 'ASSIGNED',
            departmentId: t.departmentId,
            oldData: { 
              fromId: oldAssignedToId,
              fromName: oldAssignedTo?.fullNameEn || null
            },
            newData: { 
              toId: agentId ? parseInt(agentId) : null,
              toName: newAssignedTo?.fullNameEn || null,
              performedBy: req.user!.fullNameEn,
              timestamp: new Date().toISOString()
            }
          }
        });

        updated.push(t);
      }
      return updated;
    });

    // Emit real-time notifications for each assigned ticket
    for (const t of results) {
      emitToTicket(t.id, 'ticket-assigned', { id: t.id, ticketNumber: t.ticketNumber });
      if (t.createdById) emitToUser(t.createdById, 'ticket-assigned', { id: t.id, ticketNumber: t.ticketNumber });
    }

    res.json({ message: `Successfully assigned ${results.length} tickets`, count: results.length });
  } catch (error: any) {
    if (error.message && error.message.startsWith('Agent (Dept')) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Error in bulk assign:', error);
    res.status(500).json({ message: 'Error performing bulk assignment' });
  }
});

// --- UPDATE DUE DATE ---
router.put('/:id/due-date', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;
  const { dueDate } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: parseInt(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    // Lock check: Only Super Admin can modify closed or resolved tickets
    if ((ticket.status === 'closed' || ticket.status === 'resolved') && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Closed or resolved tickets cannot be modified' });
    }

    // Only department members or admins can update due date
    const userDeptId = req.user.departmentId ? Number(req.user.departmentId) : null;
    if (userDeptId !== Number(ticket.departmentId) && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only department agents can update due date' });
    }

    const oldDueDate = ticket.dueDate;
    const updatedTicket = await prisma.ticket.update({
      where: { id: parseInt(id) },
      data: { dueDate: dueDate ? new Date(dueDate) : null }
    });

    await prisma.auditLog.create({
      data: {
        ticketId: updatedTicket.id,
        userId: req.user.id,
        action: 'DUE_DATE_CHANGED',
        departmentId: updatedTicket.departmentId,
        oldData: { from: oldDueDate },
        newData: { 
          to: updatedTicket.dueDate,
          performedBy: req.user.fullNameEn,
          timestamp: new Date().toISOString()
        }
      }
    });

    res.json(updatedTicket);
  } catch (error) {
    res.status(500).json({ message: 'Error updating due date' });
  }
});

// --- UPDATE TICKET TYPE ---
router.put('/:id/type', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;
  const { ticketTypeId } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: parseInt(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    // Lock check: Only Super Admin can modify closed or resolved tickets
    if ((ticket.status === 'closed' || ticket.status === 'resolved') && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Closed or resolved tickets cannot be modified' });
    }

    // Only department members or admins can update ticket type
    const userDeptId = req.user.departmentId ? Number(req.user.departmentId) : null;
    if (userDeptId !== Number(ticket.departmentId) && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only department agents can update issue type' });
    }

    const oldTypeId = ticket.ticketTypeId;
    const oldType = oldTypeId ? await prisma.ticketType.findUnique({ where: { id: oldTypeId } }) : null;
    const newType = ticketTypeId ? await prisma.ticketType.findUnique({ where: { id: parseInt(ticketTypeId) } }) : null;

    // Recalculate SLA based on new type
    const baseSlaHours = newType?.slaHours || 24;
    const newSlaDeadline = calculateSLADeadline(baseSlaHours, ticket.priority as any);

    const updatedTicket = await prisma.ticket.update({
      where: { id: parseInt(id) },
      data: { 
        ticketTypeId: ticketTypeId ? parseInt(ticketTypeId) : null,
        slaDeadline: newSlaDeadline
      },
      include: { ticketType: true }
    });

    await prisma.auditLog.create({
      data: {
        ticketId: updatedTicket.id,
        userId: req.user.id,
        action: 'TYPE_CHANGED',
        departmentId: updatedTicket.departmentId,
        oldData: { from: oldType?.nameEn || 'None' },
        newData: { 
          to: newType?.nameEn || 'None',
          performedBy: req.user.fullNameEn,
          timestamp: new Date().toISOString()
        }
      }
    });

    res.json(updatedTicket);
  } catch (error) {
    res.status(500).json({ message: 'Error updating issue type' });
  }
});

// --- LINK TICKETS ---
router.post('/:id/link', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;
  const { targetTicketId } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: parseInt(id) } });
    const target = await prisma.ticket.findUnique({ where: { id: parseInt(targetTicketId) } });

    if (!ticket || !target) return res.status(404).json({ message: 'One or both tickets not found' });

    // BUG FIX: Missing closed-ticket lock check on link endpoint
    if ((ticket.status === 'closed' || ticket.status === 'resolved') && req.user!.role !== 'super_admin') {
      return res.status(403).json({ message: 'Closed or resolved tickets cannot be modified' });
    }

    // Update source ticket
    const currentRelated = ticket.relatedTickets ? (() => { try { return JSON.parse(ticket.relatedTickets); } catch { return []; } })() : [];
    if (!currentRelated.includes(targetTicketId.toString())) {
      currentRelated.push(targetTicketId.toString());
    }

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { relatedTickets: JSON.stringify(currentRelated) }
    });

    const targetRelated = target.relatedTickets ? (() => { try { return JSON.parse(target.relatedTickets); } catch { return []; } })() : [];
    if (!targetRelated.includes(id.toString())) {
      targetRelated.push(id.toString());
    }

    await prisma.ticket.update({
      where: { id: target.id },
      data: { relatedTickets: JSON.stringify(targetRelated) }
    });

    await prisma.auditLog.create({
      data: {
        ticketId: ticket.id,
        userId: req.user.id,
        action: 'TICKET_LINKED',
        departmentId: ticket.departmentId,
        newData: { 
          targetId: target.id, 
          targetNumber: target.ticketNumber,
          performedBy: req.user.fullNameEn,
          timestamp: new Date().toISOString()
        }
      }
    });

    res.json({ message: 'Tickets linked successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error linking tickets' });
  }
});

// --- UNLINK TICKETS ---
router.post('/:id/unlink', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;
  const { targetTicketId } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: parseInt(id) } });
    const target = await prisma.ticket.findUnique({ where: { id: parseInt(targetTicketId) } });

    if (!ticket || !target) return res.status(404).json({ message: 'One or both tickets not found' });

    // Lock check: Only Super Admin can modify closed or resolved tickets
    if ((ticket.status === 'closed' || ticket.status === 'resolved') && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Closed or resolved tickets cannot be modified' });
    }

    // Update source ticket
    const currentRelated = ticket.relatedTickets ? (() => { try { return JSON.parse(ticket.relatedTickets); } catch { return []; } })() : [];
    const updatedRelated = currentRelated.filter((tid: string) => tid !== targetTicketId.toString());

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { relatedTickets: JSON.stringify(updatedRelated) }
    });

    const targetRelated = target.relatedTickets ? (() => { try { return JSON.parse(target.relatedTickets); } catch { return []; } })() : [];
    const updatedTargetRelated = targetRelated.filter((tid: string) => tid !== id.toString());

    await prisma.ticket.update({
      where: { id: target.id },
      data: { relatedTickets: JSON.stringify(updatedTargetRelated) }
    });

    await prisma.auditLog.create({
      data: {
        ticketId: ticket.id,
        userId: req.user.id,
        action: 'TICKET_UNLINKED',
        departmentId: ticket.departmentId,
        newData: { 
          targetId: target.id, 
          targetNumber: target.ticketNumber,
          performedBy: req.user.fullNameEn,
          timestamp: new Date().toISOString()
        }
      }
    });

    res.json({ message: 'Tickets unlinked successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error unlinking tickets' });
  }
});

// --- ARCHIVE TICKET ---
router.put('/:id/archive', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: parseInt(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    // Check permissions
    const hasPermission = await checkTicketPermission(
      req.user.id,
      req.user.role,
      req.user.departmentId ? Number(req.user.departmentId) : null,
      ticket.departmentId,
      'canArchiveTickets'
    );

    if (!hasPermission) {
      return res.status(403).json({ message: 'You do not have permission to archive this ticket' });
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: parseInt(id) },
      data: { 
        isArchived: true,
        archivedAt: new Date(),
        archivedById: req.user.id
      }
    });

    await prisma.auditLog.create({
      data: {
        ticketId: updatedTicket.id,
        userId: req.user.id,
        action: 'TICKET_ARCHIVED',
        departmentId: updatedTicket.departmentId,
        newData: { 
          performedBy: req.user.fullNameEn,
          timestamp: new Date().toISOString()
        }
      }
    });

    res.json(updatedTicket);
  } catch (error) {
    res.status(500).json({ message: 'Error archiving ticket' });
  }
});

// --- SUPER ADMIN FULL OVERRIDE ---
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super Admin override required' });
  }

  const { id } = req.params;

  const ALLOWED_FIELDS = [
    'subject', 'description', 'priority', 'dueDate', 'ticketTypeId',
    'buildingId', 'floorId', 'assetId', 'roomExtension',
    'status', 'assignedToId', 'rating', 'feedback',
    'requiresExternalResource', 'externalResourceCost', 'externalResourceNote'
  ];

  const sanitizedData: Record<string, any> = {};
  for (const key of ALLOWED_FIELDS) {
    if (req.body[key] !== undefined) {
      sanitizedData[key] = req.body[key];
    }
  }

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: parseInt(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const changedFields = Object.keys(sanitizedData);
    if (changedFields.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    if (sanitizedData.priority || sanitizedData.ticketTypeId || sanitizedData.departmentId) {
      const priority = sanitizedData.priority || ticket.priority;
      const typeId = sanitizedData.ticketTypeId !== undefined ? sanitizedData.ticketTypeId : ticket.ticketTypeId;
      const deptId = sanitizedData.departmentId !== undefined ? sanitizedData.departmentId : ticket.departmentId;

      const [targetDept, ticketType] = await Promise.all([
        prisma.department.findUnique({ where: { id: parseInt(deptId) } }),
        typeId ? prisma.ticketType.findUnique({ where: { id: parseInt(typeId) } }) : null
      ]);

      if (targetDept) {
        const baseSlaHours = ticketType?.slaHours || targetDept.slaHours || 24;
        sanitizedData.slaDeadline = calculateSLADeadline(baseSlaHours, (priority as any));
      }
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: parseInt(id) },
      data: sanitizedData
    });

    await prisma.auditLog.create({
      data: {
        ticketId: updatedTicket.id,
        userId: req.user.id,
        action: 'SUPER_ADMIN_OVERRIDE',
        departmentId: updatedTicket.departmentId,
        oldData: { id: ticket.id, ticketNumber: ticket.ticketNumber, changedFields },
        newData: {
          updatedFields: changedFields,
          performedBy: req.user.fullNameEn,
          timestamp: new Date().toISOString()
        }
      }
    });

    res.json(updatedTicket);
  } catch (error) {
    console.error('Override error:', error);
    res.status(500).json({ message: 'Error performing override' });
  }
});

// NOTE: Duplicate archive handler removed — using the primary one at line ~1168

// --- BULK ARCHIVE TICKETS ---
router.post('/bulk-archive', async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const { ticketIds } = req.body;

  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    return res.status(400).json({ message: 'No tickets provided for archiving' });
  }

  try {
    const results = await prisma.$transaction(async (tx) => {
      const tickets = await tx.ticket.findMany({
        where: { id: { in: ticketIds } }
      });

      const successfulIds: number[] = [];
      const failedIds: number[] = [];

      for (const ticket of tickets) {
        const hasPermission = await checkTicketPermission(
          req.user!.id,
          req.user!.role,
          req.user!.departmentId ? Number(req.user!.departmentId) : null,
          ticket.departmentId,
          'canArchiveTickets',
          tx
        );

        if (hasPermission) {
          await tx.ticket.update({
            where: { id: ticket.id },
            data: { isArchived: true, archivedAt: new Date() }
          });

          await tx.auditLog.create({
            data: {
              ticketId: ticket.id,
              userId: req.user!.id,
              action: 'TICKET_ARCHIVED_BULK',
              departmentId: ticket.departmentId,
              newData: { 
                performedBy: req.user!.fullNameEn,
                timestamp: new Date().toISOString()
              }
            }
          });
          successfulIds.push(ticket.id);
        } else {
          failedIds.push(ticket.id);
        }
      }

      return { successfulIds, failedIds };
    });

    res.json({
      message: `${results.successfulIds.length} tickets archived. ${results.failedIds.length} failed due to permissions.`,
      ...results
    });
  } catch (error) {
    console.error('Bulk archive error:', error);
    res.status(500).json({ message: 'Error in bulk archiving' });
  }
});

export default router;
