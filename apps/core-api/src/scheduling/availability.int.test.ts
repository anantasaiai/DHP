import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../auth/infrastructure/rbac.guard.js';
import { SchedulingModule } from './scheduling.module.js';
import { AVAILABILITY_REPOSITORY_PORT } from './domain/ports/outbound/availability-repository.port.js';
import { ok, err, NotFoundError } from '../shared-kernel/domain/result.js';
import type { Principal } from '../auth/domain/principal.js';
import supertest from 'supertest';

const MAINTAINER: Principal = { userId: 'u1', organizationId: 'org-1', role: 'MAINTAINER', subscriptionStatus: 'ACTIVE' };
const MEMBER: Principal = { userId: 'u2', organizationId: 'org-1', role: 'MEMBER', subscriptionStatus: 'ACTIVE' };

const schedule = { id: 's1', organizationId: 'org-1', ownerUserId: 'u1', name: 'Work', timezone: 'UTC', isDefault: true, rules: [], createdAt: new Date(), updatedAt: new Date() };
const override = { id: 'ov1', organizationId: 'org-1', ownerUserId: 'u1', date: new Date('2026-07-20'), available: false, startTime: null, endTime: null, reason: null, createdAt: new Date() };

const mockRepo = {
  listSchedules: async () => [schedule],
  findSchedule: async (id: string) => id === 's1' ? schedule : null,
  createSchedule: async () => ok(schedule),
  updateSchedule: async (id: string) => id === 's1' ? ok(schedule) : err(new NotFoundError('Schedule', id)),
  deleteSchedule: async (id: string) => id === 's1' ? ok(undefined) : err(new NotFoundError('Schedule', id)),
  listOverrides: async () => [override],
  createOverride: async () => ok(override),
  deleteOverride: async (id: string) => id === 'ov1' ? ok(undefined) : err(new NotFoundError('Override', id)),
};

async function buildApp(principal: Principal): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [SchedulingModule] })
    .overrideProvider(AVAILABILITY_REPOSITORY_PORT).useValue(mockRepo)
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalGuards(new RbacGuard(new Reflector()));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  app.getHttpAdapter().getInstance().addHook('onRequest', async (req: unknown) => {
    (req as Record<string, unknown>)['user'] = principal;
  });
  return app;
}

describe('Availability HTTP integration', () => {
  let maintainerApp: NestFastifyApplication;
  let memberApp: NestFastifyApplication;

  beforeAll(async () => {
    [maintainerApp, memberApp] = await Promise.all([buildApp(MAINTAINER), buildApp(MEMBER)]);
  });

  afterAll(async () => { await Promise.all([maintainerApp.close(), memberApp.close()]); });

  it('MEMBER cannot access availability routes (403)', async () => {
    const res = await supertest(memberApp.getHttpServer()).get('/api/v1/availability/schedules');
    expect(res.status).toBe(403);
  });

  it('GET /schedules returns list', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).get('/api/v1/availability/schedules');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /schedules creates schedule (201)', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).post('/api/v1/availability/schedules')
      .send({ name: 'Work', timezone: 'UTC', isDefault: false, rules: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }] });
    expect(res.status).toBe(201);
  });

  it('POST /schedules returns 400 for invalid time format', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).post('/api/v1/availability/schedules')
      .send({ name: 'Work', timezone: 'UTC', rules: [{ dayOfWeek: 1, startTime: '9:00', endTime: '17:00' }] });
    expect(res.status).toBe(400);
  });

  it('GET /schedules/:id returns schedule', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).get('/api/v1/availability/schedules/s1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('s1');
  });

  it('GET /schedules/:id returns 404 for unknown', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).get('/api/v1/availability/schedules/no-id');
    expect(res.status).toBe(404);
  });

  it('PATCH /schedules/s1 updates schedule', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).patch('/api/v1/availability/schedules/s1').send({ name: 'Updated' });
    expect(res.status).toBe(200);
  });

  it('DELETE /schedules/s1 returns 204', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).delete('/api/v1/availability/schedules/s1');
    expect(res.status).toBe(204);
  });

  it('DELETE /schedules/no-id returns 404', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).delete('/api/v1/availability/schedules/no-id');
    expect(res.status).toBe(404);
  });

  it('GET /overrides returns list', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).get('/api/v1/availability/overrides');
    expect(res.status).toBe(200);
  });

  it('POST /overrides creates override (201)', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).post('/api/v1/availability/overrides')
      .send({ date: '2026-07-20', available: false });
    expect(res.status).toBe(201);
  });

  it('POST /overrides returns 400 for bad date format', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).post('/api/v1/availability/overrides')
      .send({ date: '07/20/2026', available: false });
    expect(res.status).toBe(400);
  });

  it('DELETE /overrides/ov1 returns 204', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).delete('/api/v1/availability/overrides/ov1');
    expect(res.status).toBe(204);
  });

  it('DELETE /overrides/no-id returns 404', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).delete('/api/v1/availability/overrides/no-id');
    expect(res.status).toBe(404);
  });
});
