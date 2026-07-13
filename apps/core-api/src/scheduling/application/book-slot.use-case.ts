import { Inject, Injectable } from '@nestjs/common';
import { ok, err, NotFoundError } from '../../shared-kernel/domain/result.js';
import { SlotConflictError } from '../../shared-kernel/domain/result.js';
import type { Result } from '../../shared-kernel/domain/result.js';
import type { DomainError } from '../../shared-kernel/domain/result.js';
import type { BookSlotCommand, BookSlotUseCasePort } from '../domain/ports/inbound/book-slot.use-case.js';
import { BOOK_SLOT_USE_CASE } from '../domain/ports/inbound/book-slot.use-case.js';
import type { Booking } from '../domain/model/booking.js';
import type { BookingRepositoryPort } from '../domain/ports/outbound/booking-repository.port.js';
import { BOOKING_REPOSITORY_PORT } from '../domain/ports/outbound/booking-repository.port.js';
import type { EventPublisherPort } from '../domain/ports/outbound/event-publisher.port.js';
import { EVENT_PUBLISHER_PORT, BOOKING_EVENTS } from '../domain/ports/outbound/event-publisher.port.js';
import type { MeetingTypeRepositoryPort } from '../domain/ports/outbound/meeting-type-repository.port.js';
import { MEETING_TYPE_REPOSITORY_PORT } from '../domain/ports/outbound/meeting-type-repository.port.js';
import type { ClockPort } from '../../shared-kernel/domain/clock.port.js';
import { CLOCK_PORT } from '../../shared-kernel/domain/clock.port.js';
import type { IdGeneratorPort } from '../../shared-kernel/domain/id-generator.port.js';
import { ID_GENERATOR_PORT } from '../../shared-kernel/domain/id-generator.port.js';
import { TimeRange } from '../domain/model/time-range.js';

@Injectable()
export class BookSlotUseCase implements BookSlotUseCasePort {
  constructor(
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly bookingRepo: BookingRepositoryPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly eventPublisher: EventPublisherPort,
    @Inject(MEETING_TYPE_REPOSITORY_PORT)
    private readonly meetingTypeRepo: MeetingTypeRepositoryPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly idGen: IdGeneratorPort,
  ) {}

  async execute(command: BookSlotCommand): Promise<Result<Booking, DomainError>> {
    // Idempotency: return existing booking if key already used
    const existing = await this.bookingRepo.findByIdempotencyKey(
      command.idempotencyKey,
      command.organizationId,
    );
    if (existing) return ok(existing);

    // Load meeting type to get actual duration
    const meetingType = await this.meetingTypeRepo.findById(
      command.meetingTypeId,
      command.organizationId,
    );
    if (!meetingType) return err(new NotFoundError('MeetingType', command.meetingTypeId));
    if (!meetingType.isActive) return err(new NotFoundError('MeetingType', command.meetingTypeId));

    const id = this.idGen.generate();
    const now = this.clock.nowUtc();

    const endsAt = new Date(command.startsAt.getTime() + meetingType.durationMinutes * 60_000);
    const timeRange = TimeRange.create(command.startsAt, endsAt);

    const booking: Booking = {
      id,
      organizationId: command.organizationId,
      hostId: command.hostId,
      meetingTypeId: command.meetingTypeId,
      guestEmail: command.guestEmail,
      guestName: command.guestName,
      timeRange,
      status: 'CONFIRMED',
      joinUrl: null,
      answersJson: command.answersJson,
      idempotencyKey: command.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };

    const saveResult = await this.bookingRepo.save(booking);
    if (!saveResult.ok) return saveResult;

    await this.eventPublisher.publish({
      eventType: BOOKING_EVENTS.CONFIRMED,
      aggregateType: 'booking',
      aggregateId: booking.id,
      organizationId: booking.organizationId,
      payload: { bookingId: booking.id, hostId: booking.hostId },
      idempotencyKey: `${BOOKING_EVENTS.CONFIRMED}:${booking.id}`,
    });

    return ok(saveResult.value);
  }
}

// Export the symbol for DI
export { BOOK_SLOT_USE_CASE };
