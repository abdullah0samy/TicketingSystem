import prisma from '../db.ts';
import type { AuthRequest } from './auth.middleware.ts';

export interface PermissionCheck {
  name: string;
  flag: keyof typeof PERMISSION_FLAGS;
}

const PERMISSION_FLAGS = {
  canReceiveTickets: 'canReceiveTickets',
  canSendTickets: 'canSendTickets',
  canViewAllDeptTickets: 'canViewAllDeptTickets',
  canAssignTickets: 'canAssignTickets',
  canChangeStatus: 'canChangeStatus',
  canTransferTickets: 'canTransferTickets',
  canArchiveTickets: 'canArchiveTickets',
  canExportData: 'canExportData',
  canViewAnalytics: 'canViewAnalytics',
  canManageTeamNotes: 'canManageTeamNotes',
  canManageDeptUsers: 'canManageDeptUsers',
  canViewAuditLogs: 'canViewAuditLogs',
  canManageKnowledgeBase: 'canManageKnowledgeBase',
} as const;

export type PermissionFlag = keyof typeof PERMISSION_FLAGS;

export class PermissionError extends Error {
  public readonly httpStatus = 403;
  public readonly permission: string;
  constructor(permission: string, message?: string) {
    super(message || `You do not have the required permission: ${permission}`);
    this.name = 'PermissionError';
    this.permission = permission;
  }
}

export async function checkUserPermission(
  userId: number,
  departmentId: number | null,
  permission: PermissionFlag,
  txClient: any = prisma
): Promise<boolean> {
  if (!departmentId) return false;

  const userOverride = await txClient.userPermissionOverride.findUnique({
    where: { userId },
  });

  if (userOverride && userOverride[permission] !== null) {
    return Boolean(userOverride[permission]);
  }

  const dept = await txClient.department.findUnique({
    where: { id: departmentId },
    include: { defaultPermissions: true },
  });

  if (dept?.defaultPermissions && dept.defaultPermissions[permission] !== null) {
    return Boolean(dept.defaultPermissions[permission]);
  }

  return false;
}

export function assertPermission(permission: PermissionFlag) {
  return async (req: AuthRequest, _res: any, next: any) => {
    try {
      if (!req.user) {
        return _res.status(401).json({ message: 'Unauthorized' });
      }

      if (req.user.role === 'super_admin') {
        next();
        return;
      }

      const hasPermission = await checkUserPermission(
        req.user.id,
        req.user.departmentId ?? null,
        permission
      );

      if (!hasPermission) {
        throw new PermissionError(permission);
      }

      next();
    } catch (error) {
      if (error instanceof PermissionError) {
        return _res.status(403).json({
          message: error.message,
          code: 'PERMISSION_DENIED',
          permission: error.permission,
        });
      }
      next(error);
    }
  };
}

export async function checkTicketAccess(
  req: AuthRequest,
  ticket: { id: number; createdById: number; assignedToId: number | null; departmentId: number }
): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === 'super_admin') return true;

  const userId = Number(req.user.id);
  const userDeptId = req.user.departmentId ? Number(req.user.departmentId) : null;

  if (Number(ticket.createdById) === userId) return true;
  if (ticket.assignedToId && Number(ticket.assignedToId) === userId) return true;
  if (userDeptId !== null && Number(ticket.departmentId) === userDeptId) return true;

  return false;
}

export async function assertTicketAccess(
  req: AuthRequest,
  ticket: { id: number; createdById: number; assignedToId: number | null; departmentId: number }
): Promise<void> {
  const hasAccess = await checkTicketAccess(req, ticket);
  if (!hasAccess) {
    throw new PermissionError('ticketAccess', 'You do not have access to this ticket');
  }
}
