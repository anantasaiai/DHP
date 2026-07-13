import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../rbac.guard.js';
import type { Principal } from '../../domain/principal.js';

function makeCtx(principal: Principal | undefined, requiredRoles: string[] | null = null): ExecutionContext {
  const req = { user: principal };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(roles: string[] | null): Reflector {
  return { getAllAndOverride: vi.fn().mockReturnValue(roles) } as unknown as Reflector;
}

function makeAdmin(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    role: 'ADMIN',
    subscriptionStatus: 'ACTIVE',
    username: null,
    email: null,
    ...overrides,
  };
}

describe('RbacGuard', () => {
  it('allows when no roles are required', () => {
    const guard = new RbacGuard(makeReflector(null));
    expect(guard.canActivate(makeCtx(makeAdmin()))).toBe(true);
  });

  it('allows when required roles array is empty', () => {
    const guard = new RbacGuard(makeReflector([]));
    expect(guard.canActivate(makeCtx(makeAdmin()))).toBe(true);
  });

  it('throws ForbiddenException when no principal on request', () => {
    const guard = new RbacGuard(makeReflector(['ADMIN']));
    expect(() => guard.canActivate(makeCtx(undefined))).toThrow(ForbiddenException);
  });

  it('allows ADMIN when ADMIN role is required', () => {
    const guard = new RbacGuard(makeReflector(['ADMIN']));
    expect(guard.canActivate(makeCtx(makeAdmin({ role: 'ADMIN' })))).toBe(true);
  });

  it('throws ForbiddenException when MEMBER tries ADMIN-only endpoint', () => {
    const guard = new RbacGuard(makeReflector(['ADMIN']));
    expect(() => guard.canActivate(makeCtx(makeAdmin({ role: 'MEMBER' })))).toThrow(ForbiddenException);
  });

  it('allows MAINTAINER when ADMIN or MAINTAINER is required', () => {
    const guard = new RbacGuard(makeReflector(['ADMIN', 'MAINTAINER']));
    expect(guard.canActivate(makeCtx(makeAdmin({ role: 'MAINTAINER' })))).toBe(true);
  });

  it('SUPER_ADMIN bypasses all role checks — ADMIN required', () => {
    const guard = new RbacGuard(makeReflector(['ADMIN']));
    const principal = makeAdmin({ role: 'SUPER_ADMIN', organizationId: null });
    expect(guard.canActivate(makeCtx(principal))).toBe(true);
  });

  it('SUPER_ADMIN bypasses all role checks — MAINTAINER required', () => {
    const guard = new RbacGuard(makeReflector(['MAINTAINER']));
    const principal = makeAdmin({ role: 'SUPER_ADMIN', organizationId: null });
    expect(guard.canActivate(makeCtx(principal))).toBe(true);
  });

  it('SUPER_ADMIN bypasses all role checks — no roles required', () => {
    const guard = new RbacGuard(makeReflector(null));
    const principal = makeAdmin({ role: 'SUPER_ADMIN', organizationId: null });
    expect(guard.canActivate(makeCtx(principal))).toBe(true);
  });

  it('throws ForbiddenException for MEMBER trying MAINTAINER-only endpoint', () => {
    const guard = new RbacGuard(makeReflector(['MAINTAINER']));
    expect(() => guard.canActivate(makeCtx(makeAdmin({ role: 'MEMBER' })))).toThrow(ForbiddenException);
  });

  it('ForbiddenException body includes required role in message', () => {
    const guard = new RbacGuard(makeReflector(['ADMIN']));
    try {
      guard.canActivate(makeCtx(makeAdmin({ role: 'MEMBER' })));
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const body = (e as ForbiddenException).getResponse() as Record<string, unknown>;
      expect(JSON.stringify(body)).toContain('ADMIN');
    }
  });

  it('allows exact role match in multi-role requirement', () => {
    const guard = new RbacGuard(makeReflector(['ADMIN', 'MAINTAINER']));
    expect(guard.canActivate(makeCtx(makeAdmin({ role: 'ADMIN' })))).toBe(true);
    expect(guard.canActivate(makeCtx(makeAdmin({ role: 'MAINTAINER' })))).toBe(true);
  });

  it('denies MEMBER from multi-role requirement', () => {
    const guard = new RbacGuard(makeReflector(['ADMIN', 'MAINTAINER']));
    expect(() => guard.canActivate(makeCtx(makeAdmin({ role: 'MEMBER' })))).toThrow(ForbiddenException);
  });
});
