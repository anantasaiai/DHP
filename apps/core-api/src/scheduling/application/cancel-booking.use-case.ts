import { Injectable, Inject } from '@nestjs/common';
import type { CancelBookingCommand, CancelBookingUseCasePort } from '../domain/ports/inbound/cancel-booking.use-case.js';
import { CANCEL_BOOKING_USE_CASE } from '../domain/ports/inbound/cancel-booking.use-case.js';
import type { BookingRepositoryPort } from '../domain/ports/outbound/booking-repository.port.js';
import { BOOKING_REPOSITORY_PORT } from '../domain/ports/outbound/booking-repository.port.js';
import type { EventPublisherPort } from '../domain/ports/outbound/event-publisher.port.js';
import { EVENT_PUBLISHER_PORT, BOOKING_EVENTS } from '../domain/ports/outbound/event-publisher.port.js';
import { ok, err } from '../../shared-kernel/domain/result.js';
import { NotFoundError } from '../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../shared-kernel/domain/result.js';
import type { Booking } from '../domain/model/booking.js';

@Injectable()
export class CancelBookingUseCase implements CancelBookingUseCasePort {
  constructor(
    @Inject(BOOKING_REPOSITORY_PORT) private readonly bookingRepo: BookingRepositoryPort,
    @Inject(EVENT_PUBLISHER_PORT) private readonly eventPublisher: EventPublisherPort,
  ) {}

  async execute(command: CancelBookingCommand): Promise<Result<Booking, DomainError>> {
    const booking = await this.bookingRepo.findById(command.bookingId, command.organizationId);
    if (!booking) {
      return err(new NotFoundError('Booking', command.bookingId));
    }

    if (booking.status === 'CANCELLED' || booking.status === 'RESCHEDULED') {
      return ok(booking);
    }

    const result = await this.bookingRepo.updateStatus(command.bookingId, command.organizationId, 'CANCELLED');
    if (!result.ok) {
      return result;
    }

    await this.eventPublisher.publish({
      eventType: BOOKING_EVENTS.CANCELLED,
      aggregateType: 'Booking',
      aggregateId: result.value.id,
      organizationId: result.value.organizationId,
      payload: { bookingId: result.value.id, status: 'CANCELLED' },
      idempotencyKey: `${result.value.id}:CANCELLED`,
    });

    return ok(result.value);
  }
}

export { CANCEL_BOOKING_USE_CASE };
