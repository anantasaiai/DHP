/**
 * Pure availability computation — no I/O, no framework imports.
 * §7 rules 1, 4, 5, 10: store/compute in UTC; buffers expand effective range;
 * lead-time and horizon filters applied here; ~100% branch-tested.
 */
import { DateTime, IANAZone } from 'luxon';
import type { ClockPort } from '../../../shared-kernel/domain/clock.port.js';
import { TimeRange } from './time-range.js';
import { AvailabilityInterval } from './availability-interval.js';

export interface WeeklyRule {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export interface DateOverride {
  date: string;    // YYYY-MM-DD
  available: boolean;
  startTime?: string;
  endTime?: string;
}

export interface BufferConfig {
  beforeMinutes: number;
  afterMinutes: number;
}

export interface BusyBlock {
  startsAt: Date;
  endsAt: Date;
}

export interface ComputeAvailabilityInput {
  timezone: string;
  weeklyRules: WeeklyRule[];
  overrides: DateOverride[];
  busyBlocks: BusyBlock[];
  buffer: BufferConfig;
  durationMinutes: number;
  minNoticeMinutes: number;
  maxDaysInFuture: number;
  windowFrom: Date;
  windowTo: Date;
  slotStepMinutes: number;
}

export interface AvailabilityEnginePort {
  computeSlots(input: ComputeAvailabilityInput): AvailabilityInterval[];
}

export function computeAvailability(
  input: ComputeAvailabilityInput,
  clock: ClockPort,
): AvailabilityInterval[] {
  const {
    timezone, weeklyRules, overrides, busyBlocks, buffer,
    durationMinutes, minNoticeMinutes, maxDaysInFuture,
    windowFrom, windowTo, slotStepMinutes,
  } = input;

  const zone = IANAZone.create(timezone);
  if (!zone.isValid) return [];

  const now = clock.nowUtc();
  const earliestStart = new Date(now.getTime() + minNoticeMinutes * 60_000);
  const horizon = new Date(now.getTime() + maxDaysInFuture * 86_400_000);

  const effectiveFrom = maxDate(windowFrom, earliestStart);
  const effectiveTo = minDate(windowTo, horizon);
  if (effectiveFrom >= effectiveTo) return [];

  // Build override map keyed by date string
  const overrideMap = new Map<string, DateOverride>();
  for (const o of overrides) overrideMap.set(o.date, o);

  const busyRanges = busyBlocks.map((b) =>
    TimeRange.create(b.startsAt, b.endsAt).expandBy(
      buffer.beforeMinutes * 60_000,
      buffer.afterMinutes * 60_000,
    ),
  );

  const slots: AvailabilityInterval[] = [];
  const stepMs = slotStepMinutes * 60_000;
  const durationMs = durationMinutes * 60_000;

  // Iterate candidate slot starts from effectiveFrom to effectiveTo
  let candidate = alignToStep(effectiveFrom, stepMs);
  while (candidate < effectiveTo) {
    const slotEnd = new Date(candidate.getTime() + durationMs);
    if (slotEnd > effectiveTo) break;

    const slotRange = TimeRange.create(candidate, slotEnd);

    if (isInWorkingHours(candidate, slotRange, weeklyRules, overrideMap, zone) &&
        !isBlocked(slotRange, busyRanges)) {
      slots.push(new AvailabilityInterval(slotRange));
    }

    candidate = new Date(candidate.getTime() + stepMs);
  }

  return slots;
}

function isInWorkingHours(
  startsAt: Date,
  slotRange: TimeRange,
  rules: WeeklyRule[],
  overrides: Map<string, DateOverride>,
  zone: IANAZone,
): boolean {
  const local = DateTime.fromJSDate(startsAt, { zone });
  const dateStr = local.toISODate();
  if (!dateStr) return false;

  const override = overrides.get(dateStr);
  if (override) {
    if (!override.available) return false;
    if (!override.startTime || !override.endTime) return false;
    const availInterval = parseLocalInterval(dateStr, override.startTime, override.endTime, zone);
    if (!availInterval) return false;
    return availInterval.contains(slotRange);
  }

  const dow = local.weekday % 7 as 0 | 1 | 2 | 3 | 4 | 5 | 6; // luxon: Mon=1; 0=Sun after %7
  const applicableRules = rules.filter((r) => r.dayOfWeek === dow);

  for (const rule of applicableRules) {
    const interval = parseLocalInterval(dateStr, rule.startTime, rule.endTime, zone);
    if (interval && interval.contains(slotRange)) return true;
  }

  return false;
}

function parseLocalInterval(
  date: string,
  startTime: string,
  endTime: string,
  zone: IANAZone,
): AvailabilityInterval | null {
  const start = DateTime.fromISO(`${date}T${startTime}`, { zone });
  let end = DateTime.fromISO(`${date}T${endTime}`, { zone });
  // handle overnight (uncommon but valid)
  if (end <= start) end = end.plus({ days: 1 });
  if (!start.isValid || !end.isValid) return null;

  const range = TimeRange.create(start.toJSDate(), end.toJSDate());
  return new AvailabilityInterval(range);
}

function isBlocked(slotRange: TimeRange, busyRanges: TimeRange[]): boolean {
  return busyRanges.some((b) => slotRange.overlaps(b));
}

function alignToStep(date: Date, stepMs: number): Date {
  const ms = date.getTime();
  const remainder = ms % stepMs;
  return remainder === 0 ? date : new Date(ms + (stepMs - remainder));
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}
