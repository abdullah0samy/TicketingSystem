import { PrismaClient } from '@prisma/client';
import { vi } from 'vitest';

const prisma = new PrismaClient();

export async function cleanDatabase(): Promise<void> {
  await prisma.ticketMessage.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.userPermissionOverride.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.ticketType.deleteMany();
  await prisma.deptPermissions.deleteMany();
  await prisma.building.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
}

export async function withRollback(fn: () => Promise<void>): Promise<void> {
  await prisma.$transaction(async () => {
    await cleanDatabase();
    await fn();
    throw new Error('ROLLBACK');
  }, { timeout: 30000 }).catch((err: any) => {
    if (err.message !== 'ROLLBACK') throw err;
  });
}

export function createMockPrisma() {
  const mockModel = () => ({
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  });

  return {
    user: mockModel(),
    ticket: mockModel(),
    department: mockModel(),
    ticketType: mockModel(),
    ticketMessage: mockModel(),
    auditLog: mockModel(),
    notification: mockModel(),
    deptPermissions: mockModel(),
    building: mockModel(),
    floor: mockModel(),
    role: mockModel(),
    permission: mockModel(),
    ticketStatusHistory: mockModel(),
    ticketTransfer: mockModel(),
    teamNote: mockModel(),
    teamNoteComment: mockModel(),
    teamNoteLike: mockModel(),
    knowledgeArticle: mockModel(),
    knowledgeCategory: mockModel(),
    asset: mockModel(),
    exportHistory: mockModel(),
    userPermissionOverride: mockModel(),
    deptTransferAllowlist: mockModel(),
    pushSubscription: mockModel(),
    $transaction: vi.fn((fn: any) => fn()),
    $use: vi.fn(),
    $on: vi.fn(),
    $disconnect: vi.fn(),
    $connect: vi.fn(),
  } as unknown as PrismaClient;
}

export { prisma };
