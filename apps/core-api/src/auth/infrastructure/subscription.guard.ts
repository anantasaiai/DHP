import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { Principal } from '../domain/principal.js';
import { IS_PUBLIC_KEY } from './public-endpoint.decorator.js';

const ACTIVE_STATUSES = new Set(['ACTIVE', 'TRIALING']);

/**
 * §7A.4a gate 0 — subscription entitlement check.
 * Runs after AuthplexJwtGuard has set req.user.
 * Public endpoints (already bypassed by AuthplexJwtGuard) are also bypassed here.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: Principal }>();
    const principal = request.user;

    if (!principal) return true; // AuthplexJwtGuard handles missing principal

    if (!ACTIVE_STATUSES.has(principal.subscriptionStatus)) {
      throw new HttpException(
        {
          error: {
            code: 'PAYMENT_REQUIRED',
            message: "Your organization's subscription is not active.",
          },
        },
        402,
      );
    }

    return true;
  }
}
