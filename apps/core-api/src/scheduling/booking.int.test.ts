import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../auth/infrastructure/rbac.guard.js';
import { BookingController } from './infrastructure/http/booking.controller.js';
import { BOOK_SLOT_USE_CASE } from './domain/ports/inbound/book-slot.use-case.js';
import { CANCEL_BOOKING_USE_CASE } from './domain/ports/inbound/cancel-booking.use-case.js';
import { RESCHEDULE_BOOKING_USE_CASE } from './domain/ports/inbound/reschedule-booking.use-case.js';
import { ok, err, SlotConflictError, NotFoundError } from '../shared-kernel/domain/result.js';
import { PrismaService } from '../shared-kernel/infrastructure/persistence/prisma.service.js';
import type { Principal } from '../auth/domain/principal.js';
import { Module } from '@nestjs/common';
import supertest from 'supertest';

const MAINTAINER: Principal = { userId: 'u1', organizationId: 'org-1', role: 'MAINTAINER', subscriptionStatus: 'ACTIVE' };
const MEMBER: Principal = { userId: 'u2', organizationId: 'org-1', role: 'MEMBER', subscriptionStatus: 'ACTIVE' };

const mockBooking = {
  id: 'b1', organizationId: 'org-1', hostId: 'h1', meetingTypeId: 'mt1',
  guestEmail: 'g@example.com', guestName: 'Guest', status: 'CONFIRMED',
  startsAt: new Date('2026-07-15T09:00:00Z'), endsAt: new Date('2026-07-15T09:30:00Z'),
  joinUrl: null, idempotencyKey: 'k1', createdAt: new Date(), updatedAt: new Date(),
};

const mockBookSlot = { execute: async () => ok(mockBooking) };
const mockCancelBooking = { execute: async (cmd: { bookingId: string }) => cmd.bookingId === 'b1' ? ok(undefined) : err(new NotFoundError('Booking', cmd.bookingId)) };
const mockRescheduleBooking = {
  execute: async (cmd: { bookingId: string }) => {
    if (cmd.bookingId === 'b1') return ok(mockBooking);
    if (cmd.bookingId === 'conflict') return err(new SlotConflictError('other'));
    return err(new NotFoundError('Booking', cmd.bookingId));
  }
};
const mockPrisma = { booking: { findMany: async () => [mockBooking] } };

@Module({
  controllers: [BookingController],
  providers: [
    { provide: BOOK_SLOT_USE_CASE, useValue: mockBookSlot },
    { provide: CANCEL_BOOKING_USE_CASE, useValue: mockCancelBooking },
    { provide: RESCHEDULE_BOOKING_USE_CASE, useValue: mockRescheduleBooking },
    { provide: PrismaService, useValue: mockPrisma },
  ],
})
class BookingTestModule {}

async function buildApp(principal: Principal): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [BookingTestModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalGuards(new RbacGuard(new Reflector()));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  app.getHttpAdapter().getInstance().addHook('onRequest', async (req: unknown) => {
    (req as Record<string, unknown>)['user'] = principal;
  });
  return app;
}

const VALID_BOOKING = {
  hostId: '00000000-0000-0000-0000-000000000001',
  meetingTypeId: '00000000-0000-0000-0000-000000000002',
  guestEmail: 'guest@example.com',
  guestName: 'Guest User',
  startsAt: '2026-07-15T09:00:00.000Z',
  appointmentType: 'online',
  idempotencyKey: 'idem-key-1',
};

describe('Booking HTTP integration', () => {
  let maintainerApp: NestFastifyApplication;
  let memberApp: NestFastifyApplication;

  beforeAll(async () => {
    [maintainerApp, memberApp] = await Promise.all([buildApp(MAINTAINER), buildApp(MEMBER)]);
  });

  afterAll(async () => { await Promise.all([maintainerApp.close(), memberApp.close()]); });

  it('MEMBER cannot create bookings (403)', async () => {
    const res = await supertest(memberApp.getHttpServer()).post('/api/v1/bookings').send(VALID_BOOKING);
    expect(res.status).toBe(403);
  });

  it('POST /api/v1/bookings creates booking (201)', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).post('/api/v1/bookings').send(VALID_BOOKING);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('b1');
  });

  it('POST /api/v1/bookings with in_person type (201)', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).post('/api/v1/bookings').send({ ...VALID_BOOKING, appointmentType: 'in_person', idempotencyKey: 'k2' });
    expect(res.status).toBe(201);
  });

  it('POST /api/v1/bookings returns 400 for missing guestEmail', async () => {
    const { guestEmail: _, ...body } = VALID_BOOKING;
    const res = await supertest(maintainerApp.getHttpServer()).post('/api/v1/bookings').send(body);
    expect(res.status).toBe(400);
  });

  it('POST /api/v1/bookings returns 400 for invalid appointmentType', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).post('/api/v1/bookings').send({ ...VALID_BOOKING, appointmentType: 'telegram' });
    expect(res.status).toBe(400);
  });

  it('GET /api/v1/bookings returns list', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).get('/api/v1/bookings');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('PATCH /api/v1/bookings/b1/reschedule reschedules (200)', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).patch('/api/v1/bookings/b1/reschedule').send({ newStartsAt: '2026-07-16T10:00:00.000Z' });
    expect(res.status).toBe(200);
  });

  it('PATCH /api/v1/bookings/conflict/reschedule returns 409', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).patch('/api/v1/bookings/conflict/reschedule').send({ newStartsAt: '2026-07-16T10:00:00.000Z' });
    expect(res.status).toBe(409);
  });

  it('PATCH /api/v1/bookings/unknown/reschedule returns 404', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).patch('/api/v1/bookings/unknown/reschedule').send({ newStartsAt: '2026-07-16T10:00:00.000Z' });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/v1/bookings/b1 cancels booking (204)', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).delete('/api/v1/bookings/b1');
    expect(res.status).toBe(204);
  });

  it('DELETE /api/v1/bookings/unknown returns 404', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).delete('/api/v1/bookings/unknown');
    expect(res.status).toBe(404);
  });
});
