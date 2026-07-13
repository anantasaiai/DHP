import { ValidationError } from '../../../shared-kernel/domain/result.js';

export class TimeRange {
  readonly startsAt: Date;
  readonly endsAt: Date;

  private constructor(startsAt: Date, endsAt: Date) {
    this.startsAt = startsAt;
    this.endsAt = endsAt;
  }

  static create(startsAt: Date, endsAt: Date): TimeRange {
    if (endsAt <= startsAt) {
      throw new ValidationError('endsAt must be after startsAt', {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
    }
    return new TimeRange(startsAt, endsAt);
  }

  durationMs(): number {
    return this.endsAt.getTime() - this.startsAt.getTime();
  }

  durationMinutes(): number {
    return this.durationMs() / 60_000;
  }

  overlaps(other: TimeRange): boolean {
    return this.startsAt < other.endsAt && other.startsAt < this.endsAt;
  }

  contains(ts: Date): boolean {
    return ts >= this.startsAt && ts < this.endsAt;
  }

  expandBy(beforeMs: number, afterMs: number): TimeRange {
    return new TimeRange(
      new Date(this.startsAt.getTime() - beforeMs),
      new Date(this.endsAt.getTime() + afterMs),
    );
  }

  equals(other: TimeRange): boolean {
    return (
      this.startsAt.getTime() === other.startsAt.getTime() &&
      this.endsAt.getTime() === other.endsAt.getTime()
    );
  }
}
