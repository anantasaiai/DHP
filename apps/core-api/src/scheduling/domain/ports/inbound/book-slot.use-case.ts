import type { Result } from '../../../../shared-kernel/domain/result.js';
import type { DomainError } from '../../../../shared-kernel/domain/result.js';
import type { Booking } from '../../model/booking.js';

export interface BookSlotCommand {
  readonly organizationId: string;
  readonly hostId: string;
  readonly meetingTypeId: string;
  readonly guestEmail: string;
  readonly guestName: string;
  readonly startsAt: Date; // UTC
  readonly answersJson: Record<string, unknown>;
  readonly idempotencyKey: string;
  readonly requestedByUserId?: string; // set for AI-proposed bookings
}

export interface BookSlotUseCasePort {
  execute(command: BookSlotCommand): Promise<Result<Booking, DomainError>>;
}

export const BOOK_SLOT_USE_CASE = Symbol('BookSlotUseCasePort');
