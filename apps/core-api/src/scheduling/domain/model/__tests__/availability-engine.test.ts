import { describe, it, expect, beforeEach } from 'vitest';
import { computeAvailability } from '../availability-engine.js';
import type { ComputeAvailabilityInput } from '../availability-engine.js';
import type { ClockPort } from '../../../../shared-kernel/domain/clock.port.js';

// Deterministic clock stub — no wall-clock, no flakiness (§3A.3)
function fixedClock(isoUtc: string): ClockPort {
  const fixed = new Date(isoUtc);
  return { now: () => fixed, nowUtc: () => fixed };
}

const BASE_INPUT: ComputeAvailabilityInput = {
  timezone: 'America/New_York',
  weeklyRules: [
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }, // Monday
    { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' }, // Tuesday
    { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' }, // Wednesday
    { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' }, // Thursday
    { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' }, // Friday
  ],
  overrides: [],
  busyBlocks: [],
  buffer: { beforeMinutes: 0, afterMinutes: 0 },
  durationMinutes: 30,
  minNoticeMinutes: 0,
  maxDaysInFuture: 7,
  windowFrom: new Date('2026-07-06T09:00:00-04:00'), // Monday 9am ET
  windowTo: new Date('2026-07-06T17:00:00-04:00'),   // Monday 5pm ET
  slotStepMinutes: 30,
};

describe('computeAvailability', () => {
  it('returns slots within working hours', () => {
    const clock = fixedClock('2026-07-06T08:00:00Z');
    const slots = computeAvailability(BASE_INPUT, clock);
    expect(slots.length).toBeGreaterThan(0);
    // 9am–5pm = 8 hours = 16 slots of 30 min
    expect(slots.length).toBe(16);
  });

  it('returns no slots outside working hours', () => {
    const input: ComputeAvailabilityInput = {
      ...BASE_INPUT,
      windowFrom: new Date('2026-07-06T17:00:00-04:00'),
      windowTo: new Date('2026-07-06T18:00:00-04:00'),
    };
    const clock = fixedClock('2026-07-06T08:00:00Z');
    const slots = computeAvailability(input, clock);
    expect(slots).toHaveLength(0);
  });

  it('filters busy blocks correctly', () => {
    const busyStart = new Date('2026-07-06T13:00:00-04:00');
    const busyEnd = new Date('2026-07-06T14:00:00-04:00');
    const input: ComputeAvailabilityInput = {
      ...BASE_INPUT,
      busyBlocks: [{ startsAt: busyStart, endsAt: busyEnd }],
    };
    const clock = fixedClock('2026-07-06T08:00:00Z');
    const slots = computeAvailability(input, clock);
    const hasConflict = slots.some(
      (s) => s.startsAt < busyEnd && s.endsAt > busyStart,
    );
    expect(hasConflict).toBe(false);
  });

  it('applies buffer expansion to busy blocks', () => {
    const busyStart = new Date('2026-07-06T13:00:00-04:00');
    const busyEnd = new Date('2026-07-06T13:30:00-04:00');
    const input: ComputeAvailabilityInput = {
      ...BASE_INPUT,
      buffer: { beforeMinutes: 15, afterMinutes: 15 },
      busyBlocks: [{ startsAt: busyStart, endsAt: busyEnd }],
    };
    const clock = fixedClock('2026-07-06T08:00:00Z');
    const slots = computeAvailability(input, clock);
    // Effective busy: 12:45–13:45 ET
    const effectiveBusyStart = new Date('2026-07-06T12:45:00-04:00');
    const effectiveBusyEnd = new Date('2026-07-06T13:45:00-04:00');
    const hasConflict = slots.some(
      (s) => s.startsAt < effectiveBusyEnd && s.endsAt > effectiveBusyStart,
    );
    expect(hasConflict).toBe(false);
  });

  it('respects min-notice filter', () => {
    // Clock is 10 minutes before first slot; with 30min notice, first slot should be skipped
    const clock = fixedClock('2026-07-06T12:55:00Z'); // 8:55am ET — 5 min before 9am
    const input: ComputeAvailabilityInput = {
      ...BASE_INPUT,
      minNoticeMinutes: 60, // 1 hour notice required
    };
    const slots = computeAvailability(input, clock);
    // All 9am slots should be excluded; earliest valid is 10am ET
    const firstSlot = slots[0];
    expect(firstSlot).toBeDefined();
    if (firstSlot) {
      expect(firstSlot.startsAt.getTime()).toBeGreaterThanOrEqual(
        new Date('2026-07-06T13:55:00Z').getTime(), // clock + 60 min
      );
    }
  });

  it('applies date override — unavailable day', () => {
    const input: ComputeAvailabilityInput = {
      ...BASE_INPUT,
      overrides: [{ date: '2026-07-06', available: false }],
    };
    const clock = fixedClock('2026-07-06T08:00:00Z');
    const slots = computeAvailability(input, clock);
    expect(slots).toHaveLength(0);
  });

  it('applies date override — custom hours', () => {
    const input: ComputeAvailabilityInput = {
      ...BASE_INPUT,
      overrides: [
        { date: '2026-07-06', available: true, startTime: '10:00', endTime: '12:00' },
      ],
    };
    const clock = fixedClock('2026-07-06T08:00:00Z');
    const slots = computeAvailability(input, clock);
    // 10am–12pm = 4 slots of 30 min
    expect(slots).toHaveLength(4);
  });

  it('returns empty array for invalid timezone', () => {
    const input: ComputeAvailabilityInput = {
      ...BASE_INPUT,
      timezone: 'Not/A/Timezone',
    };
    const clock = fixedClock('2026-07-06T08:00:00Z');
    const slots = computeAvailability(input, clock);
    expect(slots).toHaveLength(0);
  });

  it('returns empty when window is beyond horizon', () => {
    const clock = fixedClock('2026-07-06T08:00:00Z');
    const input: ComputeAvailabilityInput = {
      ...BASE_INPUT,
      maxDaysInFuture: 1,
      windowFrom: new Date('2026-07-10T09:00:00-04:00'),
      windowTo: new Date('2026-07-10T17:00:00-04:00'),
    };
    const slots = computeAvailability(input, clock);
    expect(slots).toHaveLength(0);
  });
});
