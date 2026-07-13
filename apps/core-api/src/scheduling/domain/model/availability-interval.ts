import { TimeRange } from './time-range.js';

export class AvailabilityInterval {
  readonly range: TimeRange;

  constructor(range: TimeRange) {
    this.range = range;
  }

  get startsAt(): Date {
    return this.range.startsAt;
  }

  get endsAt(): Date {
    return this.range.endsAt;
  }

  durationMinutes(): number {
    return this.range.durationMinutes();
  }

  contains(slotRange: TimeRange): boolean {
    return (
      this.startsAt <= slotRange.startsAt &&
      this.endsAt >= slotRange.endsAt
    );
  }
}
