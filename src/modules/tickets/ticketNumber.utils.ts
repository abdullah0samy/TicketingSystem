import prisma from '../../core/db.ts';
import type { PrismaClient } from '@prisma/client';

type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

const MAX_RETRIES = 3;

export class TicketNumberGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TicketNumberGenerationError';
  }
}

async function getDepartmentCode(
  departmentId: number,
  tx: TransactionClient
): Promise<string> {
  const dept = await tx.department.findUnique({
    where: { id: departmentId },
    select: { code: true },
  });
  if (!dept) {
    throw new TicketNumberGenerationError(
      `Department ${departmentId} not found`
    );
  }
  return dept.code;
}

export async function generateTicketNumber(
  departmentId: number,
  tx: TransactionClient
): Promise<string> {
  const year = new Date().getFullYear();
  const deptCode = await getDepartmentCode(departmentId, tx);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const rows = await tx.$queryRawUnsafe<Array<{ counter: bigint }>>(
        `INSERT INTO ticket_counters (year, department_id, counter, created_at, updated_at)
         VALUES ($1, $2, 1, NOW(), NOW())
         ON CONFLICT (year, department_id)
         DO UPDATE SET counter = ticket_counters.counter + 1, updated_at = NOW()
         RETURNING counter`,
        year,
        departmentId
      );

      if (!rows || rows.length === 0) {
        throw new TicketNumberGenerationError(
          'Failed to generate ticket counter'
        );
      }

      const seq = Number(rows[0].counter);
      return `${deptCode}-${year}-${String(seq).padStart(4, '0')}`;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      if (isLastAttempt) {
        throw error;
      }
      if (
        error instanceof TicketNumberGenerationError
      ) {
        throw error;
      }
    }
  }

  throw new TicketNumberGenerationError(
    'Exhausted retries for ticket number generation'
  );
}

export async function getTicketNumberFromId(ticketId: number): Promise<string | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { ticketNumber: true },
  });
  return ticket?.ticketNumber ?? null;
}
