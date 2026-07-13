import type { Result } from '../../../../shared-kernel/domain/result.js';
import type { DomainError } from '../../../../shared-kernel/domain/result.js';
import type { OrgMember, MemberRole } from '../../model/org-member.js';

export interface InviteMemberCommand {
  readonly organizationId: string;
  readonly invitedByUserId: string;
  readonly invitedEmail: string;
  readonly role: MemberRole;
}

export interface InviteMemberUseCasePort {
  execute(cmd: InviteMemberCommand): Promise<Result<OrgMember, DomainError>>;
}

export const INVITE_MEMBER_USE_CASE = Symbol('InviteMemberUseCasePort');
