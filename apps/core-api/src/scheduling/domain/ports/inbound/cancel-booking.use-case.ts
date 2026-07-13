import type { Result } from '../../../../shared-kernel/domain/result.js';
import type { DomainError } from '../../../../shared-kernel/domain/result.js';
import type { Booking } from '../../model/booking.js';

export interface CancelBookingCommand {
  readonly bookingId: string;
  readonly organizationId: string;
  readonly requestedByUserId?: string;
  readonly guestToken?: string; // for guest self-service
}

export interface CancelBookingUseCasePort {
  execute(command: CancelBookingCommand): Promise<Result<Booking, DomainError>>;
}

export const CANCEL_BOOKING_USE_CASE = Symbol('CancelBookingUseCasePort');
