import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { Principal } from '../domain/principal.js';
import type { MemberRole } from '@dhp/types';

export const ROLES_KEY = 'roles';

const BYPASS_RBAC_ROLES = new Set<MemberRole>(['SUPER_ADMIN']);

/** Decorate a controller or handler with @RequireRoles('ADMIN') */
export const RequireRoles = (...roles: MemberRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/**
 * Two-gate authorization (§7A.4):
 *  Gate 1: org isolation — enforced by AuthplexJwtGuard + RLS (always active)
 *  Gate 2 (this guard): RBAC role check at the use-case boundary
 *
 * SUPER_ADMIN bypasses gate 2 entirely — they operate cross-org.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<MemberRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: Principal }>();
    const principal = req.user;

    if (!principal) {
      throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Not authenticated' } });
    }

    // SUPER_ADMIN bypasses all role checks
    if (BYPASS_RBAC_ROLES.has(principal.role)) return true;

    if (!requiredRoles.includes(principal.role)) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: `Requires role: ${requiredRoles.join(' or ')}`,
        },
      });
    }

    return true;
  }
}
