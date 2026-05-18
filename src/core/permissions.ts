import prisma from './db.ts';
import { getCachedPermissions, setCachedPermissions } from './permissionCache.ts';

type PermissionField =
  | 'canChangeStatus'
  | 'canAssignTickets'
  | 'canTransferTickets'
  | 'canArchiveTickets'
  | 'canViewAllDeptTickets'
  | 'canViewAnalytics'
  | 'canExportData'
  | 'canManageTeamNotes'
  | 'canManageDeptUsers'
  | 'canViewAuditLogs'
  | 'canManageKnowledgeBase'
  | 'canSendTickets'
  | 'canReceiveTickets';

export async function getUserPermission(
  userId: number,
  role: string,
  deptId: number | null,
  permission: PermissionField,
  options?: { useCache?: boolean; txClient?: any; fallback?: boolean }
): Promise<boolean> {
  if (role === 'super_admin') return true;

  const tx = options?.txClient || prisma;
  const useCache = options?.useCache !== false;

  if (useCache && deptId && !options?.txClient) {
    const cached = getCachedPermissions(userId, deptId);
    if (cached) {
      const val = (cached as any)[permission];
      if (val !== undefined && val !== null) return Boolean(val);
    }
  }

  const userOverride = await tx.userPermissionOverride.findUnique({ where: { userId } });
  if (userOverride && (userOverride as any)[permission] !== null) {
    return Boolean((userOverride as any)[permission]);
  }

  if (deptId) {
    const dept = await tx.department.findUnique({
      where: { id: deptId },
      include: { defaultPermissions: true }
    });
    if (dept?.defaultPermissions && (dept.defaultPermissions as any)[permission] !== null) {
      return Boolean((dept.defaultPermissions as any)[permission]);
    }
  }

  return options?.fallback ?? false;
}

export async function getDepartmentUserIds(
  deptId: number,
  txClient?: any
): Promise<number[]> {
  const tx = txClient || prisma;
  const users = await tx.user.findMany({
    where: { departmentId: deptId, deletedAt: null, isActive: true },
    select: { id: true }
  });
  return users.map((u: any) => u.id);
}
