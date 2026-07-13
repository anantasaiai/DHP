import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwksCache } from './infrastructure/jwks.cache.js';
import { AuthplexJwtGuard } from './infrastructure/authplex-jwt.guard.js';
import { RbacGuard } from './infrastructure/rbac.guard.js';
import { SubscriptionGuard } from './infrastructure/subscription.guard.js';
import { MembershipResolver } from './application/membership-resolver.service.js';
import { ProvisionUserUseCase } from './application/provision-user.use-case.js';
import { AuthController } from './infrastructure/http/auth.controller.js';
import { PrismaPrincipalRepository } from './infrastructure/persistence/prisma-principal.repository.js';
import { PrismaAuthProvisionRepository } from './infrastructure/persistence/prisma-auth-provision.repository.js';
import { PRINCIPAL_REPOSITORY_PORT } from './domain/ports/outbound/principal-repository.port.js';
import { AUTH_PROVISION_PORT } from './domain/ports/outbound/auth-provision.port.js';

@Module({
  controllers: [AuthController],
  providers: [
    JwksCache,
    MembershipResolver,
    ProvisionUserUseCase,
    { provide: PRINCIPAL_REPOSITORY_PORT, useClass: PrismaPrincipalRepository },
    { provide: AUTH_PROVISION_PORT, useClass: PrismaAuthProvisionRepository },
    // Register guards globally via APP_GUARD — order matters:
    // 1. JWT guard runs first (sets req.user)
    // 2. RBAC guard runs second (checks req.user.role)
    // 3. Subscription guard runs third (checks subscription status)
    { provide: APP_GUARD, useClass: AuthplexJwtGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
  exports: [JwksCache, MembershipResolver],
})
export class AuthModule {}
