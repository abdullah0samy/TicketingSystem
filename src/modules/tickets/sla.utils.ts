import { PRIORITY_SLA_MODIFIERS, type TicketPriority } from './workflow.constants.ts';

/**
 * Calculates the SLA deadline for a ticket.
 * @param baseHours The base SLA hours (e.g., from Department or TicketType)
 * @param priority The priority of the ticket
 * @param startTime The start time for calculation (defaults to now)
 * @returns Date representing the SLA deadline
 */
export function calculateSLADeadline(
  baseHours: number,
  priority: TicketPriority = 'normal',
  startTime: Date = new Date()
): Date {
  // Apply priority modifier
  const modifier = PRIORITY_SLA_MODIFIERS[priority] || 1;
  const effectiveHours = baseHours * modifier;

  const deadline = new Date(startTime);
  
  // NOTE: Simple addition. Future versions could handle business hours.
  deadline.setMilliseconds(deadline.getMilliseconds() + effectiveHours * 60 * 60 * 1000);
  
  return deadline;
}

/**
 * Checks if a ticket has breached its SLA.
 * @param deadline The SLA deadline
 * @param completedAt Optional completion date
 * @returns boolean
 */
export function isSLABreached(deadline: Date, completedAt?: Date | null): boolean {
  const reference = completedAt ? new Date(completedAt) : new Date();
  return reference > new Date(deadline);
}
