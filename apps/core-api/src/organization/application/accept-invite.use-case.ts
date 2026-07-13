import { Inject, Injectable } from '@nestjs/common';
import { ok, err, NotFoundError, ValidationError } from '../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../shared-kernel/domain/result.js';
import type { OrgMember } from '../domain/model/org-member.js';
import type { AcceptInviteCommand, AcceptInviteUseCasePort } from '../domain/ports/inbound/accept-invite.use-case.js';
import { ACCEPT_INVITE_USE_CASE } from '../domain/ports/inbound/accept-invite.use-case.js';
import type { OrgMemberRepositoryPort } from '../domain/ports/outbound/org-member-repository.port.js';
import { ORG_MEMBER_REPOSITORY_PORT } from '../domain/ports/outbound/org-member-repository.port.js';
import type { UserRepositoryPort } from '../domain/ports/outbound/user-profile-repository.port.js';
import { USER_REPOSITORY_PORT } from '../domain/ports/outbound/user-profile-repository.port.js';
import type { ClockPort } from '../../shared-kernel/domain/clock.port.js';
import { CLOCK_PORT } from '../../shared-kernel/domain/clock.port.js';
import type { IdGeneratorPort } from '../../shared-kernel/domain/id-generator.port.js';
import { ID_GENERATOR_PORT } from '../../shared-kernel/domain/id-generator.port.js';

@Injectable()
export class AcceptInviteUseCase implements AcceptInviteUseCasePort {
  constructor(
    @Inject(ORG_MEMBER_REPOSITORY_PORT) private readonly membershipRepo: OrgMemberRepositoryPort,
    @Inject(USER_REPOSITORY_PORT) private readonly userRepo: UserRepositoryPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT) private readonly idGen: IdGeneratorPort,
  ) {}

  async execute(cmd: AcceptInviteCommand): Promise<Result<OrgMember, DomainError>> {
    const membership = await this.membershipRepo.findByInviteToken(cmd.inviteToken);
    if (!membership) {
      return err(new NotFoundError('Invite', cmd.inviteToken));
    }

    if (membership.invitedEmail.toLowerCase() !== cmd.acceptingEmail.toLowerCase()) {
      return err(new ValidationError('This invite was sent to a different email address'));
    }

    // If this user already exists in the system, their stored email must match the invite.
    // Prevents an admin (or wrong logged-in user) from accidentally accepting someone else's invite
    // and overwriting their own profile.
    const existingUser = await this.userRepo.findByIdGlobal(cmd.acceptingUserId);
    if (existingUser && existingUser.email.toLowerCase() !== membership.invitedEmail.toLowerCase()) {
      return err(new ValidationError(
        `You are signed in as ${existingUser.email}. Please sign out and sign in with ${membership.invitedEmail} to accept this invite.`,
      ));
    }

    const now = this.clock.nowUtc();
    const profileResult = await this.userRepo.upsert({
      id: cmd.acceptingUserId,
      organizationId: membership.organizationId,
      username: cmd.username,
      email: cmd.acceptingEmail,
      timezone: cmd.timezone,
      preferencesJson: {},
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    if (!profileResult.ok) return profileResult;

    return this.membershipRepo.linkUser(membership.id, cmd.acceptingUserId);
  }
}

export { ACCEPT_INVITE_USE_CASE };
