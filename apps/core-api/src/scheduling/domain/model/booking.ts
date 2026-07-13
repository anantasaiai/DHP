import type { TimeRange } from './time-range.js';

export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'PENDING';

export interface Booking {
  readonly id: string;
  readonly organizationId: string;
  readonly hostId: string;
  readonly meetingTypeId: string;
  readonly guestEmail: string;
  readonly guestName: string;
  readonly timeRange: TimeRange;
  readonly status: BookingStatus;
  readonly joinUrl: string | null;
  readonly answersJson: Record<string, unknown>;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function isActiveBooking(booking: Booking): boolean {
  return booking.status === 'CONFIRMED' || booking.status === 'PENDING';
}
