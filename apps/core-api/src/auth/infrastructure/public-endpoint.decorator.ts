import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a controller or handler as public — skips AuthplexJwtGuard.
 * Used for: public booking pages, health checks, OIDC callbacks.
 *
 * NOTE: public endpoints still get rate-limited (§11A.2).
 * They are NOT exempt from the DB-level booking invariant (§7).
 */
export const PublicEndpoint = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
