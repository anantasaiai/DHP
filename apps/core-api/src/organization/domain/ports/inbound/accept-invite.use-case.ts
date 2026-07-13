import type { Result } from '../../../../shared-kernel/domain/result.js';
import type { DomainError } from '../../../../shared-kernel/domain/result.js';
import type { OrgMember } from '../../model/org-member.js';

export interface AcceptInviteCommand {
  readonly inviteToken: string;
  readonly acceptingUserId: string; // OIDC sub of the person accepting
  readonly acceptingEmail: string;
  readonly username: string;
  readonly timezone: string;
}

export interface AcceptInviteUseCasePort {
  execute(cmd: AcceptInviteCommand): Promise<Result<OrgMember, DomainError>>;
}

export const ACCEPT_INVITE_USE_CASE = Symbol('AcceptInviteUseCasePort');
