import type { Result } from '../../../../shared-kernel/domain/result.js';
import type { DomainError } from '../../../../shared-kernel/domain/result.js';

export interface RemoveMemberCommand {
  readonly organizationId: string;
  readonly actorUserId: string;   // must be ADMIN
  readonly memberId: string;      // OrgMember.id — works for both active and invited members
}

export interface RemoveMemberUseCasePort {
  execute(cmd: RemoveMemberCommand): Promise<Result<void, DomainError>>;
}

export const REMOVE_MEMBER_USE_CASE = Symbol('RemoveMemberUseCasePort');
