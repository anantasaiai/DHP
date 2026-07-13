import { Module } from '@nestjs/common';

// ── Booking — inbound ports ───────────────────────────────────────────────────
import { BOOK_SLOT_USE_CASE } from './domain/ports/inbound/book-slot.use-case.js';
import { CANCEL_BOOKING_USE_CASE } from './domain/ports/inbound/cancel-booking.use-case.js';
import { RESCHEDULE_BOOKING_USE_CASE } from './domain/ports/inbound/reschedule-booking.use-case.js';

// ── Meeting Types — inbound ports ─────────────────────────────────────────────
import { CREATE_MEETING_TYPE_USE_CASE, UPDATE_MEETING_TYPE_USE_CASE, ARCHIVE_MEETING_TYPE_USE_CASE } from './domain/ports/inbound/meeting-type-use-cases.js';

// ── Outbound ports ────────────────────────────────────────────────────────────
import { BOOKING_REPOSITORY_PORT } from './domain/ports/outbound/booking-repository.port.js';
import { MEETING_TYPE_REPOSITORY_PORT } from './domain/ports/outbound/meeting-type-repository.port.js';
import { AVAILABILITY_REPOSITORY_PORT } from './domain/ports/outbound/availability-repository.port.js';
import { EVENT_PUBLISHER_PORT } from './domain/ports/outbound/event-publisher.port.js';
import { REALTIME_PUBLISHER_PORT } from './domain/ports/outbound/realtime-publisher.port.js';
import { EMAIL_DISPATCHER_PORT } from './domain/ports/outbound/email-dispatcher.port.js';
import { CALENDAR_PROVIDER_PORT } from './domain/ports/outbound/calendar-provider.port.js';
import { MEETING_PROVIDER_PORT } from './domain/ports/outbound/meeting-provider.port.js';
import { TOKEN_VAULT_PORT } from './domain/ports/outbound/token-vault.port.js';

// ── Application use cases ─────────────────────────────────────────────────────
import { BookSlotUseCase } from './application/book-slot.use-case.js';
import { CancelBookingUseCase } from './application/cancel-booking.use-case.js';
import { RescheduleBookingUseCase } from './application/reschedule-booking.use-case.js';
import { CreateMeetingTypeUseCase } from './application/create-meeting-type.use-case.js';
import { UpdateMeetingTypeUseCase } from './application/update-meeting-type.use-case.js';
import { ArchiveMeetingTypeUseCase } from './application/archive-meeting-type.use-case.js';

// ── Infrastructure adapters ───────────────────────────────────────────────────
import { PrismaBookingRepository } from './infrastructure/persistence/prisma-booking.repository.js';
import { PrismaMeetingTypeRepository } from './infrastructure/persistence/prisma-meeting-type.repository.js';
import { PrismaAvailabilityRepository } from './infrastructure/persistence/prisma-availability.repository.js';
import { OutboxEventPublisher } from './infrastructure/messaging/outbox-event-publisher.js';
import { RedisProvider } from './infrastructure/messaging/redis.provider.js';
import { RedisRealtimePublisher } from './infrastructure/messaging/redis-realtime-publisher.js';
import { LogEmailDispatcher } from './infrastructure/email/log-email-dispatcher.js';
import { NoOpCalendarProvider } from './infrastructure/calendar/no-op-calendar-provider.js';
import { NoOpMeetingProvider } from './infrastructure/meeting/no-op-meeting-provider.js';
import { AesTokenVault } from './infrastructure/vault/aes-token-vault.js';

// ── HTTP controllers ──────────────────────────────────────────────────────────
import { BookingController } from './infrastructure/http/booking.controller.js';
import { MeetingTypeController } from './infrastructure/http/meeting-type.controller.js';
import { AvailabilityController } from './infrastructure/http/availability.controller.js';
import { AvailabilityScheduleController } from './infrastructure/http/availability-schedule.controller.js';

@Module({
  providers: [
    // ── Redis client (shared by realtime publisher + future SSE adapter) ───
    RedisProvider,

    // ── Booking outbound adapters ───────────────────────────────────────────
    { provide: BOOKING_REPOSITORY_PORT, useClass: PrismaBookingRepository },
    { provide: EVENT_PUBLISHER_PORT, useClass: OutboxEventPublisher },
    { provide: REALTIME_PUBLISHER_PORT, useClass: RedisRealtimePublisher },
    // TODO: swap LogEmailDispatcher → SesEmailDispatcher / SendGridEmailDispatcher
    { provide: EMAIL_DISPATCHER_PORT, useClass: LogEmailDispatcher },
    // TODO: swap NoOpCalendarProvider → GoogleCalendarProvider / MicrosoftCalendarProvider
    { provide: CALENDAR_PROVIDER_PORT, useClass: NoOpCalendarProvider },
    // TODO: swap NoOpMeetingProvider → ZoomMeetingProvider / GoogleMeetProvider
    { provide: MEETING_PROVIDER_PORT, useClass: NoOpMeetingProvider },
    { provide: TOKEN_VAULT_PORT, useClass: AesTokenVault },

    // ── Meeting Types outbound adapters ─────────────────────────────────────
    { provide: MEETING_TYPE_REPOSITORY_PORT, useClass: PrismaMeetingTypeRepository },

    // ── Availability outbound adapters ──────────────────────────────────────
    { provide: AVAILABILITY_REPOSITORY_PORT, useClass: PrismaAvailabilityRepository },

    // ── Booking use cases ───────────────────────────────────────────────────
    { provide: BOOK_SLOT_USE_CASE, useClass: BookSlotUseCase },
    { provide: CANCEL_BOOKING_USE_CASE, useClass: CancelBookingUseCase },
    { provide: RESCHEDULE_BOOKING_USE_CASE, useClass: RescheduleBookingUseCase },

    // ── Meeting Types use cases ─────────────────────────────────────────────
    { provide: CREATE_MEETING_TYPE_USE_CASE, useClass: CreateMeetingTypeUseCase },
    { provide: UPDATE_MEETING_TYPE_USE_CASE, useClass: UpdateMeetingTypeUseCase },
    { provide: ARCHIVE_MEETING_TYPE_USE_CASE, useClass: ArchiveMeetingTypeUseCase },
  ],
  controllers: [BookingController, MeetingTypeController, AvailabilityController, AvailabilityScheduleController],
})
export class SchedulingModule {}
