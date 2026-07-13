import type { Principal } from '../../principal.js';

export interface ProvisionUserInput {
  readonly sub: string;
  readonly email: string;
  readonly name: string;
}

export interface AuthProvisionPort {
  findExistingPrincipal(sub: string): Promise<Principal | null>;
  createOrgAndUser(input: ProvisionUserInput): Promise<Principal>;
}

export const AUTH_PROVISION_PORT = Symbol('AuthProvisionPort');
