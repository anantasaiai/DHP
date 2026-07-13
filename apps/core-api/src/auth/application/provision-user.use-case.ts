import { Injectable, Inject } from '@nestjs/common';
import type { Principal } from '../domain/principal.js';
import type { AuthProvisionPort, ProvisionUserInput } from '../domain/ports/outbound/auth-provision.port.js';
import { AUTH_PROVISION_PORT } from '../domain/ports/outbound/auth-provision.port.js';

export type { ProvisionUserInput };

/**
 * Provisions a new organization + user + membership on first login.
 * Idempotent: returns the existing principal if the user already exists.
 */
@Injectable()
export class ProvisionUserUseCase {
  constructor(
    @Inject(AUTH_PROVISION_PORT)
    private readonly authProvision: AuthProvisionPort,
  ) {}

  async execute(input: ProvisionUserInput): Promise<Principal> {
    const existing = await this.authProvision.findExistingPrincipal(input.sub);
    if (existing) return existing;
    return this.authProvision.createOrgAndUser(input);
  }
}
