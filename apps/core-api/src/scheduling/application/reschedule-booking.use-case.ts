import { Injectable, Inject } from '@nestjs/common';
import type { RescheduleBookingCommand, RescheduleBookingUseCasePort } from '../domain/ports/inbound/reschedule-booking.use-case.js';
import { RESCHEDULE_BOOKING_USE_CASE } from '../domain/ports/inbound/reschedule-booking.use-case.js';
import type { BookingRepositoryPort } from '../domain/ports/outbound/booking-repository.port.js';
import { BOOKING_REPOSITORY_PORT } from '../domain/ports/outbound/booking-repository.port.js';
import type { EventPublisherPort } from '../domain/ports/outbound/event-publisher.port.js';
import { EVENT_PUBLISHER_PORT, BOOKING_EVENTS } from '../domain/ports/outbound/event-publisher.port.js';
import { ok, err } from '../../shared-kernel/domain/result.js';
import { NotFoundError, ValidationError } from '../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../shared-kernel/domain/result.js';
import type { Booking } from '../domain/model/booking.js';
import { TimeRange } from '../domain/model/time-range.js';

@Injectable()
export class RescheduleBookingUseCase implements RescheduleBookingUseCasePort {
  constructor(
    @Inject(BOOKING_REPOSITORY_PORT) private readonly bookingRepo: BookingRepositoryPort,
    @Inject(EVENT_PUBLISHER_PORT) private readonly eventPublisher: EventPublisherPort,
  ) {}

  async execute(command: RescheduleBookingCommand): Promise<Result<Booking, DomainError>> {
    const booking = await this.bookingRepo.findById(command.bookingId, command.organizationId);
    if (!booking) {
      return err(new NotFoundError('Booking', command.bookingId));
    }

    if (booking.status === 'CANCELLED') {
      return err(new ValidationError('Cannot reschedule a cancelled booking'));
    }

    const durationMs = booking.timeRange.durationMs();
    const newEndsAt = new Date(command.newStartsAt.getTime() + durationMs);
    const newTimeRange = TimeRange.create(command.newStartsAt, newEndsAt);

    const result = await this.bookingRepo.reschedule(command.bookingId, command.organizationId, newTimeRange);
    if (!result.ok) {
      return result;
    }

    await this.eventPublisher.publish({
      eventType: BOOKING_EVENTS.RESCHEDULED,
      aggregateType: 'Booking',
      aggregateId: result.value.id,
      organizationId: result.value.organizationId,
      payload: {
        bookingId: result.value.id,
        newStartsAt: newTimeRange.startsAt.toISOString(),
        newEndsAt: newTimeRange.endsAt.toISOString(),
      },
      idempotencyKey: `${result.value.id}:RESCHEDULED:${newTimeRange.startsAt.toISOString()}`,
    });

    return ok(result.value);
  }
}

export { RESCHEDULE_BOOKING_USE_CASE };
