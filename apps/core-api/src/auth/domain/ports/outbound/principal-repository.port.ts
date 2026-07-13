import type { Principal } from '../../principal.js';

export interface PrincipalRepositoryPort {
  resolveFromSub(sub: string): Promise<Principal | null>;
}

export const PRINCIPAL_REPOSITORY_PORT = Symbol('PrincipalRepositoryPort');
