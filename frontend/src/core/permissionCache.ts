interface PermissionEntry {
  canChangeStatus: boolean | null;
  canAssignTickets: boolean | null;
  canTransferTickets: boolean | null;
  canArchiveTickets: boolean | null;
  expiresAt: number;
}

const cache = new Map<string, PermissionEntry>();
const TTL_MS = 30_000;

function cacheKey(userId: number, deptId: number): string {
  return `${userId}:${deptId}`;
}

export function getCachedPermissions(userId: number, deptId: number): PermissionEntry | null {
  const key = cacheKey(userId, deptId);
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) cache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedPermissions(
  userId: number,
  deptId: number,
  perms: { canChangeStatus: boolean | null; canAssignTickets: boolean | null; canTransferTickets: boolean | null; canArchiveTickets: boolean | null }
): void {
  cache.set(cacheKey(userId, deptId), { ...perms, expiresAt: Date.now() + TTL_MS });
}

export function invalidatePermissionCache(userId?: number, deptId?: number): void {
  if (userId !== undefined && deptId !== undefined) {
    cache.delete(cacheKey(userId, deptId));
  } else {
    cache.clear();
  }
}
