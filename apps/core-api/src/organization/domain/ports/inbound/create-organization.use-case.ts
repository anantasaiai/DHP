import type { Result } from '../../../../shared-kernel/domain/result.js';
import type { DomainError } from '../../../../shared-kernel/domain/result.js';
import type { Organization } from '../../model/organization.js';

export interface CreateOrganizationCommand {
  readonly name: string;
  readonly slug: string;
  readonly founderUserId: string;  // becomes first ADMIN member
  readonly founderEmail: string;
}

export interface CreateOrganizationUseCasePort {
  execute(cmd: CreateOrganizationCommand): Promise<Result<Organization, DomainError>>;
}

export const CREATE_ORGANIZATION_USE_CASE = Symbol('CreateOrganizationUseCasePort');
