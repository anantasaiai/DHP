import type { Result } from '../../../../shared-kernel/domain/result.js';
import type { DomainError } from '../../../../shared-kernel/domain/result.js';
import type { UserProfile } from '../../model/org-member.js';

export interface UserRepositoryPort {
  findById(id: string, organizationId: string): Promise<UserProfile | null>;
  findByIdGlobal(id: string): Promise<UserProfile | null>;
  findByEmail(email: string, organizationId: string): Promise<UserProfile | null>;
  findByUsername(username: string, organizationId: string): Promise<UserProfile | null>;
  upsert(profile: UserProfile): Promise<Result<UserProfile, DomainError>>;
  updateProfile(
    id: string,
    organizationId: string,
    patch: Partial<Pick<UserProfile, 'username' | 'timezone' | 'preferencesJson'>>,
  ): Promise<Result<UserProfile, DomainError>>;
  softDelete(id: string, organizationId: string): Promise<Result<void, DomainError>>;
}

export const USER_REPOSITORY_PORT = Symbol('UserRepositoryPort');
