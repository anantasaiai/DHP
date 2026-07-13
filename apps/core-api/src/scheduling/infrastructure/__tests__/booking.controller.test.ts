import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BookingController } from '../http/booking.controller.js';
import { ok, err, SlotConflictError, NotFoundError } from '../../../shared-kernel/domain/result.js';
import type { BookSlotUseCasePort } from '../../domain/ports/inbound/book-slot.use-case.js';
import type { CancelBookingUseCasePort } from '../../domain/ports/inbound/cancel-booking.use-case.js';
import type { RescheduleBookingUseCasePort } from '../../domain/ports/inbound/reschedule-booking.use-case.js';
import type { Principal } from '../../../auth/domain/principal.js';
import type { Booking } from '../../domain/model/booking.js';

function makeBookSlot(): BookSlotUseCasePort {
  return { execute: vi.fn().mockResolvedValue(ok(makeBooking())) };
}
function makeCancelBooking(): CancelBookingUseCasePort {
  return { execute: vi.fn().mockResolvedValue(ok(undefined)) };
}
function makeRescheduleBooking(): RescheduleBookingUseCasePort {
  return { execute: vi.fn().mockResolvedValue(ok(makeBooking())) };
}
function makePrisma() {
  return { booking: { findMany: vi.fn().mockResolvedValue([]) } };
}

function makeBooking(): Booking {
  return {
    id: 'b1', organizationId: 'org-1', hostId: 'h1', meetingTypeId: 'mt1',
    guestEmail: 'guest@example.com', guestName: 'Guest',
    timeRange: { startsAt: new Date('2026-07-15T09:00:00Z'), endsAt: new Date('2026-07-15T09:30:00Z') } as never,
    status: 'CONFIRMED', joinUrl: null, answersJson: {}, idempotencyKey: 'idem-1',
    createdAt: new Date(), updatedAt: new Date(),
  } as never;
}

function makeReq(userId = 'u1'): { user: Principal } {
  return { user: { userId, organizationId: 'org-1', role: 'ADMIN', subscriptionStatus: 'ACTIVE' } };
}

const VALID_CREATE = {
  hostId: '00000000-0000-0000-0000-000000000001',
  meetingTypeId: '00000000-0000-0000-0000-000000000002',
  guestEmail: 'guest@example.com',
  guestName: 'Guest User',
  startsAt: '2026-07-15T09:00:00.000Z',
  appointmentType: 'online',
  idempotencyKey: 'key-123',
};

describe('BookingController — unit', () => {
  let bookSlot: BookSlotUseCasePort;
  let cancelBooking: CancelBookingUseCasePort;
  let rescheduleBooking: RescheduleBookingUseCasePort;
  let prisma: ReturnType<typeof makePrisma>;
  let controller: BookingController;

  beforeEach(() => {
    bookSlot = makeBookSlot();
    cancelBooking = makeCancelBooking();
    rescheduleBooking = makeRescheduleBooking();
    prisma = makePrisma();
    controller = new BookingController(bookSlot, cancelBooking, rescheduleBooking, prisma as never);
  });

  // ── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('creates booking with online appointment type', async () => {
      vi.mocked(bookSlot.execute).mockResolvedValue(ok(makeBooking()));
      const result = await controller.create(makeReq() as never, VALID_CREATE);
      expect(result).toMatchObject({ id: 'b1' });
      expect(bookSlot.execute).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', guestEmail: 'guest@example.com' })
      );
    });

    it('creates booking with in_person appointment type', async () => {
      vi.mocked(bookSlot.execute).mockResolvedValue(ok(makeBooking()));
      await controller.create(makeReq() as never, { ...VALID_CREATE, appointmentType: 'in_person' });
      expect(bookSlot.execute).toHaveBeenCalled();
    });

    it('defaults appointmentType to online when omitted', async () => {
      const { appointmentType: _, ...withoutType } = VALID_CREATE;
      vi.mocked(bookSlot.execute).mockResolvedValue(ok(makeBooking()));
      await controller.create(makeReq() as never, withoutType);
      expect(bookSlot.execute).toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid email', async () => {
      await expect(controller.create(makeReq() as never, { ...VALID_CREATE, guestEmail: 'not-email' })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for missing idempotencyKey', async () => {
      const { idempotencyKey: _, ...body } = VALID_CREATE;
      await expect(controller.create(makeReq() as never, body)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid appointmentType', async () => {
      await expect(controller.create(makeReq() as never, { ...VALID_CREATE, appointmentType: 'fax' })).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException on SlotConflictError', async () => {
      vi.mocked(bookSlot.execute).mockResolvedValue(err(new SlotConflictError('b-conflict')));
      await expect(controller.create(makeReq() as never, VALID_CREATE)).rejects.toThrow(ConflictException);
    });
  });

  // ── list ───────────────────────────────────────────────────────────────────
  describe('list', () => {
    it('lists bookings for org', async () => {
      prisma.booking.findMany.mockResolvedValue([makeBooking()]);
      const result = await controller.list(makeReq() as never, {});
      expect(Array.isArray(result)).toBe(true);
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) })
      );
    });

    it('filters by hostId when provided', async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      await controller.list(makeReq() as never, { hostId: '00000000-0000-0000-0000-000000000001' });
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ hostId: '00000000-0000-0000-0000-000000000001' }) })
      );
    });

    it('filters by status when provided', async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      await controller.list(makeReq() as never, { status: 'CONFIRMED' });
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'CONFIRMED' }) })
      );
    });
  });

  // ── reschedule ─────────────────────────────────────────────────────────────
  describe('reschedule', () => {
    it('reschedules booking', async () => {
      vi.mocked(rescheduleBooking.execute).mockResolvedValue(ok(makeBooking()));
      const result = await controller.reschedule(makeReq() as never, 'b1', { newStartsAt: '2026-07-16T10:00:00.000Z' });
      expect(result).toMatchObject({ id: 'b1' });
      expect(rescheduleBooking.execute).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: 'b1', organizationId: 'org-1' })
      );
    });

    it('throws BadRequestException for invalid datetime', async () => {
      await expect(controller.reschedule(makeReq() as never, 'b1', { newStartsAt: 'not-a-date' })).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException on SlotConflictError', async () => {
      vi.mocked(rescheduleBooking.execute).mockResolvedValue(err(new SlotConflictError()));
      await expect(controller.reschedule(makeReq() as never, 'b1', { newStartsAt: '2026-07-16T10:00:00.000Z' })).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException on NotFoundError', async () => {
      vi.mocked(rescheduleBooking.execute).mockResolvedValue(err(new NotFoundError('Booking', 'b1')));
      await expect(controller.reschedule(makeReq() as never, 'b1', { newStartsAt: '2026-07-16T10:00:00.000Z' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────────
  describe('cancel', () => {
    it('cancels booking', async () => {
      vi.mocked(cancelBooking.execute).mockResolvedValue(ok(undefined));
      await expect(controller.cancel(makeReq() as never, 'b1')).resolves.toBeUndefined();
      expect(cancelBooking.execute).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: 'b1', organizationId: 'org-1', requestedByUserId: 'u1' })
      );
    });

    it('throws NotFoundException on NotFoundError', async () => {
      vi.mocked(cancelBooking.execute).mockResolvedValue(err(new NotFoundError('Booking', 'b1')));
      await expect(controller.cancel(makeReq() as never, 'b1')).rejects.toThrow(NotFoundException);
    });
  });
});
