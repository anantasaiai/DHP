import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Reflector } from '@nestjs/core';
import { APP_GUARD } from '@nestjs/core';
import { RbacGuard } from './infrastructure/rbac.guard.js';
import { Controller, Get, Module } from '@nestjs/common';
import { RequireRoles } from './infrastructure/rbac.guard.js';
import type { Principal } from './domain/principal.js';
import supertest from 'supertest';

// Stub controller to test role enforcement end-to-end
@Controller('test')
class TestController {
  @Get('admin-only')
  @RequireRoles('ADMIN')
  adminOnly() { return { ok: true }; }

  @Get('maintainer-only')
  @RequireRoles('MAINTAINER')
  maintainerOnly() { return { ok: true }; }

  @Get('admin-or-maintainer')
  @RequireRoles('ADMIN', 'MAINTAINER')
  adminOrMaintainer() { return { ok: true }; }

  @Get('public')
  publicEndpoint() { return { ok: true }; }
}

@Module({ controllers: [TestController], providers: [Reflector, { provide: APP_GUARD, useClass: RbacGuard }] })
class TestModule {}

function injectUser(app: INestApplication, principal: Principal) {
  // Inject user via a middleware-like hook on the Fastify instance
  (app as NestFastifyApplication).getInstance().addHook('onRequest', async (req) => {
    (req as unknown as Record<string, unknown>).user = principal;
  });
}

async function buildApp(principal: Principal): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  injectUser(app, principal);
  return app;
}

describe('RbacGuard — HTTP integration', () => {
  let adminApp: NestFastifyApplication;
  let maintainerApp: NestFastifyApplication;
  let superAdminApp: NestFastifyApplication;
  let memberApp: NestFastifyApplication;

  const adminPrincipal: Principal = { userId: 'u1', organizationId: 'o1', role: 'ADMIN', subscriptionStatus: 'ACTIVE' };
  const maintainerPrincipal: Principal = { userId: 'u2', organizationId: 'o1', role: 'MAINTAINER', subscriptionStatus: 'ACTIVE' };
  const superAdminPrincipal: Principal = { userId: 'u3', organizationId: null, role: 'SUPER_ADMIN', subscriptionStatus: 'ACTIVE' };
  const memberPrincipal: Principal = { userId: 'u4', organizationId: 'o1', role: 'MEMBER', subscriptionStatus: 'ACTIVE' };

  beforeAll(async () => {
    [adminApp, maintainerApp, superAdminApp, memberApp] = await Promise.all([
      buildApp(adminPrincipal),
      buildApp(maintainerPrincipal),
      buildApp(superAdminPrincipal),
      buildApp(memberPrincipal),
    ]);
  });

  afterAll(async () => {
    await Promise.all([adminApp.close(), maintainerApp.close(), superAdminApp.close(), memberApp.close()]);
  });

  it('ADMIN can access admin-only route', async () => {
    const res = await supertest(adminApp.getHttpServer()).get('/test/admin-only');
    expect(res.status).toBe(200);
  });

  it('MEMBER cannot access admin-only route', async () => {
    const res = await supertest(memberApp.getHttpServer()).get('/test/admin-only');
    expect(res.status).toBe(403);
  });

  it('MAINTAINER can access maintainer-only route', async () => {
    const res = await supertest(maintainerApp.getHttpServer()).get('/test/maintainer-only');
    expect(res.status).toBe(200);
  });

  it('ADMIN cannot access maintainer-only route', async () => {
    const res = await supertest(adminApp.getHttpServer()).get('/test/maintainer-only');
    expect(res.status).toBe(403);
  });

  it('SUPER_ADMIN can access admin-only route', async () => {
    const res = await supertest(superAdminApp.getHttpServer()).get('/test/admin-only');
    expect(res.status).toBe(200);
  });

  it('SUPER_ADMIN can access maintainer-only route', async () => {
    const res = await supertest(superAdminApp.getHttpServer()).get('/test/maintainer-only');
    expect(res.status).toBe(200);
  });

  it('both ADMIN and MAINTAINER can access shared route', async () => {
    const [r1, r2] = await Promise.all([
      supertest(adminApp.getHttpServer()).get('/test/admin-or-maintainer'),
      supertest(maintainerApp.getHttpServer()).get('/test/admin-or-maintainer'),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it('MEMBER cannot access admin-or-maintainer route', async () => {
    const res = await supertest(memberApp.getHttpServer()).get('/test/admin-or-maintainer');
    expect(res.status).toBe(403);
  });

  it('any role can access public endpoint (no @RequireRoles)', async () => {
    const [r1, r2, r3, r4] = await Promise.all([
      supertest(adminApp.getHttpServer()).get('/test/public'),
      supertest(maintainerApp.getHttpServer()).get('/test/public'),
      supertest(superAdminApp.getHttpServer()).get('/test/public'),
      supertest(memberApp.getHttpServer()).get('/test/public'),
    ]);
    expect([r1.status, r2.status, r3.status, r4.status]).toEqual([200, 200, 200, 200]);
  });
});
