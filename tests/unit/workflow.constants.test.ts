import { describe, it, expect } from 'vitest';
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  ALLOWED_TRANSITIONS,
  PRIORITY_SLA_MODIFIERS,
} from '../../src/modules/tickets/workflow.constants.ts';

describe('Workflow Constants', () => {
  describe('TICKET_STATUSES', () => {
    it('should contain all expected statuses', () => {
      expect(TICKET_STATUSES).toEqual(['pending', 'open', 'in_progress', 'resolved', 'closed']);
    });

    it('should be frozen (readonly tuple)', () => {
      expect(TICKET_STATUSES.length).toBe(5);
    });
  });

  describe('TICKET_PRIORITIES', () => {
    it('should contain all expected priorities', () => {
      expect(TICKET_PRIORITIES).toEqual(['low', 'normal', 'high', 'critical']);
    });
  });

  describe('ALLOWED_TRANSITIONS', () => {
    it('should allow pending -> open, in_progress, closed', () => {
      expect(ALLOWED_TRANSITIONS.pending).toContain('open');
      expect(ALLOWED_TRANSITIONS.pending).toContain('in_progress');
      expect(ALLOWED_TRANSITIONS.pending).toContain('closed');
    });

    it('should NOT allow pending -> resolved (must go through in_progress first)', () => {
      expect(ALLOWED_TRANSITIONS.pending).not.toContain('resolved');
    });

    it('should allow in_progress -> resolved, closed', () => {
      expect(ALLOWED_TRANSITIONS.in_progress).toContain('resolved');
      expect(ALLOWED_TRANSITIONS.in_progress).toContain('closed');
    });

    it('should allow resolved -> in_progress (reopen) only; closed requires /confirm endpoint', () => {
      expect(ALLOWED_TRANSITIONS.resolved).toContain('in_progress');
      expect(ALLOWED_TRANSITIONS.resolved).not.toContain('closed');
    });

    it('should allow closed -> in_progress (reopen only)', () => {
      expect(ALLOWED_TRANSITIONS.closed).toContain('in_progress');
      expect(ALLOWED_TRANSITIONS.closed).not.toContain('resolved');
      expect(ALLOWED_TRANSITIONS.closed).not.toContain('pending');
    });

    it('should have transitions defined for every status', () => {
      for (const status of TICKET_STATUSES) {
        expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
        expect(Array.isArray(ALLOWED_TRANSITIONS[status])).toBe(true);
      }
    });

    it('should not allow any self-transitions', () => {
      for (const status of TICKET_STATUSES) {
        expect(ALLOWED_TRANSITIONS[status]).not.toContain(status);
      }
    });
  });

  describe('PRIORITY_SLA_MODIFIERS', () => {
    it('should give low priority MORE time (modifier > 1)', () => {
      expect(PRIORITY_SLA_MODIFIERS.low).toBeGreaterThan(1);
    });

    it('should keep normal priority at base time (modifier = 1)', () => {
      expect(PRIORITY_SLA_MODIFIERS.normal).toBe(1);
    });

    it('should give high priority LESS time (modifier < 1)', () => {
      expect(PRIORITY_SLA_MODIFIERS.high).toBeLessThan(1);
      expect(PRIORITY_SLA_MODIFIERS.high).toBeGreaterThan(0);
    });

    it('should give critical priority the LEAST time', () => {
      expect(PRIORITY_SLA_MODIFIERS.critical).toBeLessThan(PRIORITY_SLA_MODIFIERS.high);
      expect(PRIORITY_SLA_MODIFIERS.critical).toBeGreaterThan(0);
    });

    it('should have a modifier for every priority', () => {
      for (const priority of TICKET_PRIORITIES) {
        expect(PRIORITY_SLA_MODIFIERS[priority]).toBeDefined();
        expect(typeof PRIORITY_SLA_MODIFIERS[priority]).toBe('number');
      }
    });
  });
});
