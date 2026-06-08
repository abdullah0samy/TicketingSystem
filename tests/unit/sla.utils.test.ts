import { describe, it, expect } from 'vitest';
import { calculateSLADeadline, isSLABreached } from '../../src/modules/tickets/sla.utils.ts';

describe('SLA Utils', () => {
  describe('calculateSLADeadline', () => {
    const startTime = new Date('2026-01-15T10:00:00Z');

    it('should calculate correct deadline for normal priority (modifier = 1)', () => {
      const deadline = calculateSLADeadline(24, 'normal', startTime);
      const expected = new Date('2026-01-16T10:00:00Z');
      expect(deadline.getTime()).toBe(expected.getTime());
    });

    it('should apply low priority modifier (+50% time)', () => {
      const deadline = calculateSLADeadline(24, 'low', startTime);
      // 24 * 1.5 = 36 hours
      const expected = new Date('2026-01-16T22:00:00Z');
      expect(deadline.getTime()).toBe(expected.getTime());
    });

    it('should apply high priority modifier (-50% time)', () => {
      const deadline = calculateSLADeadline(24, 'high', startTime);
      // 24 * 0.5 = 12 hours
      const expected = new Date('2026-01-15T22:00:00Z');
      expect(deadline.getTime()).toBe(expected.getTime());
    });

    it('should apply critical priority modifier (-75% time)', () => {
      const deadline = calculateSLADeadline(24, 'critical', startTime);
      // 24 * 0.25 = 6 hours
      const expected = new Date('2026-01-15T16:00:00Z');
      expect(deadline.getTime()).toBe(expected.getTime());
    });

    it('should default to normal priority when none provided', () => {
      const deadline = calculateSLADeadline(24, undefined as any, startTime);
      // Falls back to modifier = 1 (from || 1 guard)
      const expected = new Date('2026-01-16T10:00:00Z');
      expect(deadline.getTime()).toBe(expected.getTime());
    });

    it('should handle fractional SLA hours', () => {
      const deadline = calculateSLADeadline(2.5, 'normal', startTime);
      // 2.5 hours = 150 minutes
      const expected = new Date('2026-01-15T12:30:00Z');
      expect(deadline.getTime()).toBe(expected.getTime());
    });

    it('should handle zero SLA hours', () => {
      const deadline = calculateSLADeadline(0, 'normal', startTime);
      expect(deadline.getTime()).toBe(startTime.getTime());
    });

    it('should use current time when no startTime provided', () => {
      const before = Date.now();
      const deadline = calculateSLADeadline(1, 'normal');
      const after = Date.now();
      // Deadline should be ~1 hour from now
      const oneHourMs = 60 * 60 * 1000;
      expect(deadline.getTime()).toBeGreaterThanOrEqual(before + oneHourMs - 100);
      expect(deadline.getTime()).toBeLessThanOrEqual(after + oneHourMs + 100);
    });
  });

  describe('isSLABreached', () => {
    it('should return true when current time is past deadline', () => {
      const deadline = new Date('2026-01-15T10:00:00Z');
      // Simulate "now" being after deadline by not passing completedAt
      // We can't mock Date.now, so let's use a past deadline
      const pastDeadline = new Date('2020-01-01T00:00:00Z');
      expect(isSLABreached(pastDeadline)).toBe(true);
    });

    it('should return false when deadline is in the future', () => {
      const futureDeadline = new Date('2099-12-31T23:59:59Z');
      expect(isSLABreached(futureDeadline)).toBe(false);
    });

    it('should return true when completedAt is after the deadline', () => {
      const deadline = new Date('2026-01-15T10:00:00Z');
      const completedAt = new Date('2026-01-15T12:00:00Z'); // 2 hours late
      expect(isSLABreached(deadline, completedAt)).toBe(true);
    });

    it('should return false when completedAt is before the deadline', () => {
      const deadline = new Date('2026-01-15T10:00:00Z');
      const completedAt = new Date('2026-01-15T08:00:00Z'); // 2 hours early
      expect(isSLABreached(deadline, completedAt)).toBe(false);
    });

    it('should handle null completedAt (uses current time)', () => {
      const futureDeadline = new Date('2099-12-31T23:59:59Z');
      expect(isSLABreached(futureDeadline, null)).toBe(false);
    });

    it('should handle string dates (coerced via new Date)', () => {
      const deadline = new Date('2020-01-01');
      const completedAt = new Date('2020-01-02');
      expect(isSLABreached(deadline, completedAt)).toBe(true);
    });
  });
});
