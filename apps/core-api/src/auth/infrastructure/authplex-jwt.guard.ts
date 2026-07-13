import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import type { FastifyRequest } from 'fastify';
import { JwksCache } from './jwks.cache.js';
import { MembershipResolver } from '../application/membership-resolver.service.js';
import { PrismaService } from '../../shared-kernel/infrastructure/persistence/prisma.service.js';
import type { Principal } from '../domain/principal.js';
import { IS_PUBLIC_KEY } from './public-endpoint.decorator.js';

/**
 * AuthPlex JWT guard — §7A.3 + §7A.4a authoritative implementation.
 *
 * Verification order (all must pass):
 *  1. Bearer token present
 *  2. Signature valid against AuthPlex JWKS
 *  3. iss matches OIDC_ISSUER
 *  4. aud matches OIDC_AUDIENCE
 *  5. exp, nbf checked by jose automatically
 *  6. sub resolved → active membership → {organization_id, user_id, role, subscriptionStatus}
 *  7. §7A.4a gate 0: subscription_status IN ('ACTIVE', 'TRIALING') → 402 if not
 *  8. organization_id set in DB session for RLS (§1A) — non-SUPER_ADMIN only
 *
 * Never trust sub without JWKS validation.
 * Never trust an org claim supplied by the client — always resolved server-side.
 */
@Injectable()
export class AuthplexJwtGuard implements CanActivate {
  private readonly logger = new Logger(AuthplexJwtGuard.name);
  private readonly audience: string;

  constructor(
    private readonly jwksCache: JwksCache,
    private readonly membershipResolver: MembershipResolver,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {
    this.audience = process.env['OIDC_AUDIENCE'] ?? 'dhp-api';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: Principal }>();

    const token = this.extractBearer(request);
    if (!token) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' },
      });
    }

    let sub: string;
    try {
      const { payload } = await jwtVerify(token, this.jwksCache.getJwks(), {
        issuer: this.jwksCache.getIssuer(),
        audience: this.audience,
      });

      if (typeof payload['sub'] !== 'string') {
        throw new Error('sub claim missing');
      }
      sub = payload['sub'];
    } catch (err) {
      this.logger.debug(`JWT verification failed: ${String(err)}`);
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      });
    }

    const principal = await this.membershipResolver.resolveFromSub(sub);
    if (!principal) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'No active membership found for this token' },
      });
    }

    // Set RLS context for non-SUPER_ADMIN — must happen on this connection
    // before any subsequent Prisma queries in this request.
    if (principal.organizationId !== null) {
      await this.prisma.setOrgContext(principal.organizationId);
    }

    request.user = principal;
    return true;
  }

  private extractBearer(req: FastifyRequest): string | null {
    const auth = req.headers['authorization'];
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice(7);
    }
    return null;
  }
}
