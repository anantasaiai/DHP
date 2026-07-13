import { Injectable, Inject } from '@nestjs/common';
import type { Principal } from '../domain/principal.js';
import type { PrincipalRepositoryPort } from '../domain/ports/outbound/principal-repository.port.js';
import { PRINCIPAL_REPOSITORY_PORT } from '../domain/ports/outbound/principal-repository.port.js';

/**
 * Resolves an AuthPlex `sub` → active membership → Principal.
 * SUPER_ADMIN: organizationId is null, RLS context is NOT set (cross-org access).
 * All other roles: org context is set for RLS (§1A).
 */
@Injectable()
export class MembershipResolver {
  constructor(
    @Inject(PRINCIPAL_REPOSITORY_PORT)
    private readonly principalRepo: PrincipalRepositoryPort,
  ) {}

  async resolveFromSub(sub: string): Promise<Principal | null> {
    return this.principalRepo.resolveFromSub(sub);
  }
}
