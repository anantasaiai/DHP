import {
  Controller, Post, Get, Patch, Delete, Body, Param, Req, Query,
  HttpCode, HttpStatus, Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import type { BookSlotUseCasePort } from '../../domain/ports/inbound/book-slot.use-case.js';
import { BOOK_SLOT_USE_CASE } from '../../domain/ports/inbound/book-slot.use-case.js';
import type { CancelBookingUseCasePort } from '../../domain/ports/inbound/cancel-booking.use-case.js';
import { CANCEL_BOOKING_USE_CASE } from '../../domain/ports/inbound/cancel-booking.use-case.js';
import type { RescheduleBookingUseCasePort } from '../../domain/ports/inbound/reschedule-booking.use-case.js';
import { RESCHEDULE_BOOKING_USE_CASE } from '../../domain/ports/inbound/reschedule-booking.use-case.js';
import type { BookingRepositoryPort } from '../../domain/ports/outbound/booking-repository.port.js';
import { BOOKING_REPOSITORY_PORT } from '../../domain/ports/outbound/booking-repository.port.js';
import { RequireRoles } from '../../../auth/infrastructure/rbac.guard.js';
import { mapDomainErrorToHttpException } from '../../../shared-kernel/infrastructure/http/error-mapper.js';
import type { Principal } from '../../../auth/domain/principal.js';

const CreateBookingSchema = z.object({
  hostId: z.string().uuid(),
  meetingTypeId: z.string().uuid(),
  guestEmail: z.string().email(),
  guestName: z.string().min(1).max(200),
  startsAt: z.string().datetime(),
  appointmentType: z.enum(['online', 'in_person']).default('online'),
  answersJson: z.record(z.unknown()).optional().default({}),
  idempotencyKey: z.string().min(1).max(255),
});

const RescheduleSchema = z.object({ newStartsAt: z.string().datetime() });

const ListBookingsSchema = z.object({
  hostId: z.string().uuid().optional(),
  status: z.enum(['CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'PENDING']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

@ApiTags('Bookings')
@ApiBearerAuth()
@RequireRoles('ADMIN', 'MAINTAINER')
@Controller('api/v1/bookings')
export class BookingController {
  constructor(
    @Inject(BOOK_SLOT_USE_CASE)
    private readonly bookSlot: BookSlotUseCasePort,
    @Inject(CANCEL_BOOKING_USE_CASE)
    private readonly cancelBooking: CancelBookingUseCasePort,
    @Inject(RESCHEDULE_BOOKING_USE_CASE)
    private readonly rescheduleBooking: RescheduleBookingUseCasePort,
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly bookingRepo: BookingRepositoryPort,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a booking (Org Admin + Maintainer)' })
  @ApiResponse({ status: 201, description: 'Booking confirmed' })
  @ApiResponse({ status: 409, description: 'SLOT_CONFLICT_DETECTED' })
  async create(@Req() req: FastifyRequest & { user: Principal }, @Body() body: unknown): Promise<unknown> {
    const parsed = CreateBookingSchema.safeParse(body);
    if (!parsed.success) {
      throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.flatten() });
    }
    const principal = req.user;
    const result = await this.bookSlot.execute({
      organizationId: principal.organizationId!,
      hostId: parsed.data.hostId,
      meetingTypeId: parsed.data.meetingTypeId,
      guestEmail: parsed.data.guestEmail,
      guestName: parsed.data.guestName,
      startsAt: new Date(parsed.data.startsAt),
      answersJson: parsed.data.answersJson,
      idempotencyKey: parsed.data.idempotencyKey,
      requestedByUserId: principal.userId,
    });
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List bookings for org (Org Admin + Maintainer)' })
  async list(@Req() req: FastifyRequest & { user: Principal }, @Query() rawQuery: unknown): Promise<unknown> {
    const parsed = ListBookingsSchema.safeParse(rawQuery);
    if (!parsed.success) throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid query' });
    return this.bookingRepo.listByOrg({
      organizationId: req.user.organizationId!,
      hostId: parsed.data.hostId,
      status: parsed.data.status,
      from: parsed.data.from ? new Date(parsed.data.from) : undefined,
      to: parsed.data.to ? new Date(parsed.data.to) : undefined,
    });
  }

  @Patch(':id/reschedule')
  @ApiOperation({ summary: 'Reschedule a booking (Org Admin + Maintainer)' })
  @ApiResponse({ status: 409, description: 'SLOT_CONFLICT_DETECTED' })
  async reschedule(
    @Req() req: FastifyRequest & { user: Principal },
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = RescheduleSchema.safeParse(body);
    if (!parsed.success) throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid payload' });
    const result = await this.rescheduleBooking.execute({
      bookingId: id,
      organizationId: req.user.organizationId!,
      newStartsAt: new Date(parsed.data.newStartsAt),
      requestedByUserId: req.user.userId,
    });
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a booking (Org Admin + Maintainer)' })
  async cancel(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string): Promise<void> {
    const result = await this.cancelBooking.execute({
      bookingId: id,
      organizationId: req.user.organizationId!,
      requestedByUserId: req.user.userId,
    });
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
  }
}
