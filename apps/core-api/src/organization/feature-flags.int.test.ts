import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../auth/infrastructure/rbac.guard.js';
import { OrganizationModule } from './organization.module.js';
import { FEATURE_FLAG_REPOSITORY_PORT } from './domain/ports/outbound/feature-flag-repository.port.js';
import { ok, err, NotFoundError } from '../shared-kernel/domain/result.js';
import type { Principal } from '../auth/domain/principal.js';
import type { FeatureFlag } from './domain/model/feature-flag.js';
import supertest from 'supertest';

const ADMIN: Principal = { userId: 'u1', organizationId: 'org-1', role: 'ADMIN', subscriptionStatus: 'ACTIVE' };
const MAINTAINER: Principal = { userId: 'u2', organizationId: 'org-1', role: 'MAINTAINER', subscriptionStatus: 'ACTIVE' };

function makeFlag(key = 'dark_mode'): FeatureFlag {
  return { id: 'f1', organizationId: 'org-1', key, enabled: true, payload: {}, createdAt: new Date(), updatedAt: new Date() };
}

const mockRepo = {
  listByOrg: async () => [makeFlag()],
  findByKey: async () => makeFlag(),
  upsert: async (_orgId: string, key: string, _enabled: boolean, _payload: Record<string, unknown>) => ok(makeFlag(key)),
  delete: async (_orgId: string, key: string) => key === 'existing' ? ok(undefined) : err(new NotFoundError('FeatureFlag', key)),
};

async function buildApp(principal: Principal): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [OrganizationModule] })
    .overrideProvider(FEATURE_FLAG_REPOSITORY_PORT).useValue(mockRepo)
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

describe('FeatureFlags HTTP integration', () => {
  let adminApp: NestFastifyApplication;
  let maintainerApp: NestFastifyApplication;

  beforeAll(async () => {
    [adminApp, maintainerApp] = await Promise.all([buildApp(ADMIN), buildApp(MAINTAINER)]);
  });

  afterAll(async () => {
    await Promise.all([adminApp.close(), maintainerApp.close()]);
  });

  it('MAINTAINER cannot access feature-flags (403)', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).get('/api/v1/feature-flags');
    expect(res.status).toBe(403);
  });

  it('GET /api/v1/feature-flags returns list', async () => {
    const res = await supertest(adminApp.getHttpServer()).get('/api/v1/feature-flags');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].key).toBe('dark_mode');
  });

  it('PUT /api/v1/feature-flags/:key creates/updates flag', async () => {
    const res = await supertest(adminApp.getHttpServer()).put('/api/v1/feature-flags/dark_mode').send({ enabled: true });
    expect(res.status).toBe(200);
  });

  it('PUT /api/v1/feature-flags/:key returns 400 when enabled missing', async () => {
    const res = await supertest(adminApp.getHttpServer()).put('/api/v1/feature-flags/dark_mode').send({});
    expect(res.status).toBe(400);
  });

  it('DELETE /api/v1/feature-flags/existing returns 204', async () => {
    const res = await supertest(adminApp.getHttpServer()).delete('/api/v1/feature-flags/existing');
    expect(res.status).toBe(204);
  });

  it('DELETE /api/v1/feature-flags/unknown returns 404', async () => {
    const res = await supertest(adminApp.getHttpServer()).delete('/api/v1/feature-flags/unknown');
    expect(res.status).toBe(404);
  });
});
