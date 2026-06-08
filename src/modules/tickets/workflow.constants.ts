export const TICKET_STATUSES = ['pending', 'open', 'in_progress', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  pending: ['open', 'in_progress', 'closed'],
  open: ['in_progress', 'closed'],
  in_progress: ['resolved', 'closed'],
  // NOTE: resolved → closed is intentionally REMOVED from here.
  // The only path to "closed" from "resolved" is:
  //   1. Creator confirmation via PUT /:id/confirm
  //   2. Super Admin force-close via PATCH /:id (full override)
  // This enforces the hospital workflow: agent resolves → creator confirms → auto-close.
  resolved: ['in_progress'], // Allow reopen only; closing requires creator confirmation
  closed: ['in_progress'], // Reopen (super_admin only, enforced in route handler)
};

export const PRIORITY_SLA_MODIFIERS: Record<TicketPriority, number> = {
  low: 1.5,      // +50% time
  normal: 1,     // base time
  high: 0.5,     // -50% time
  critical: 0.25 // -75% time
};
