import type { Result } from '../../../../shared-kernel/domain/result.js';
import type { DomainError } from '../../../../shared-kernel/domain/result.js';
import type { Booking } from '../../model/booking.js';

export interface RescheduleBookingCommand {
  readonly bookingId: string;
  readonly organizationId: string;
  readonly newStartsAt: Date; // UTC
  readonly requestedByUserId?: string;
  readonly guestToken?: string; // for guest self-service
}

export interface RescheduleBookingUseCasePort {
  execute(command: RescheduleBookingCommand): Promise<Result<Booking, DomainError>>;
}

export const RESCHEDULE_BOOKING_USE_CASE = Symbol('RescheduleBookingUseCasePort');
