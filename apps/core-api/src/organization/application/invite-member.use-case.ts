import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ok, err, ValidationError, ForbiddenError } from '../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../shared-kernel/domain/result.js';
import type { OrgMember } from '../domain/model/org-member.js';
import type { InviteMemberCommand, InviteMemberUseCasePort } from '../domain/ports/inbound/invite-member.use-case.js';
import { INVITE_MEMBER_USE_CASE } from '../domain/ports/inbound/invite-member.use-case.js';
import type { OrgMemberRepositoryPort } from '../domain/ports/outbound/org-member-repository.port.js';
import { ORG_MEMBER_REPOSITORY_PORT } from '../domain/ports/outbound/org-member-repository.port.js';
import type { OrganizationRepositoryPort } from '../domain/ports/outbound/organization-repository.port.js';
import { ORGANIZATION_REPOSITORY_PORT } from '../domain/ports/outbound/organization-repository.port.js';
import type { Organization } from '../domain/model/organization.js';
import type { InviteMailerPort } from '../domain/ports/outbound/invite-mailer.port.js';
import { INVITE_MAILER_PORT } from '../domain/ports/outbound/invite-mailer.port.js';
import type { ClockPort } from '../../shared-kernel/domain/clock.port.js';
import { CLOCK_PORT } from '../../shared-kernel/domain/clock.port.js';
import type { IdGeneratorPort } from '../../shared-kernel/domain/id-generator.port.js';
import { ID_GENERATOR_PORT } from '../../shared-kernel/domain/id-generator.port.js';
import type { UserRepositoryPort } from '../domain/ports/outbound/user-profile-repository.port.js';
import { USER_REPOSITORY_PORT } from '../domain/ports/outbound/user-profile-repository.port.js';

@Injectable()
export class InviteMemberUseCase implements InviteMemberUseCasePort {
  private readonly logger = new Logger(InviteMemberUseCase.name);

  constructor(
    @Inject(ORG_MEMBER_REPOSITORY_PORT) private readonly membershipRepo: OrgMemberRepositoryPort,
    @Inject(ORGANIZATION_REPOSITORY_PORT) private readonly orgRepo: OrganizationRepositoryPort,
    @Inject(USER_REPOSITORY_PORT) private readonly userRepo: UserRepositoryPort,
    @Inject(INVITE_MAILER_PORT) private readonly mailer: InviteMailerPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT) private readonly idGen: IdGeneratorPort,
  ) {}

  async execute(cmd: InviteMemberCommand): Promise<Result<OrgMember, DomainError>> {
    const actorMembership = await this.membershipRepo.findByOrgAndUser(
      cmd.organizationId,
      cmd.invitedByUserId,
    );
    if (!actorMembership || actorMembership.role !== 'ADMIN') {
      return err(new ForbiddenError('Only organization admins can invite members'));
    }

    const activeMembers = await this.membershipRepo.findActiveByOrg(cmd.organizationId);
    const alreadyMember = activeMembers.some(
      (m) => m.invitedEmail.toLowerCase() === cmd.invitedEmail.toLowerCase(),
    );
    if (alreadyMember) {
      return err(new ValidationError(`${cmd.invitedEmail} is already a member of this organization`));
    }

    const org: Organization | null = await this.orgRepo.findById(cmd.organizationId);
    if (!org) return err(new ValidationError('Organization not found'));

    const inviter = await this.userRepo.findById(cmd.invitedByUserId, cmd.organizationId);

    const inviteToken = randomBytes(32).toString('hex');
    const now = this.clock.nowUtc();

    const membership: OrgMember = {
      id: this.idGen.generate(),
      organizationId: cmd.organizationId,
      userId: null,
      role: cmd.role,
      status: 'INVITED',
      invitedBy: cmd.invitedByUserId,
      invitedEmail: cmd.invitedEmail,
      inviteToken,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.membershipRepo.save(membership);
    if (!saved.ok) return saved;

    try {
      await this.mailer.sendInvite({
        toEmail: cmd.invitedEmail,
        inviteToken,
        organizationName: org.name,
        inviterEmail: inviter?.email ?? 'an admin',
        role: cmd.role,
      });
    } catch (e) {
      this.logger.error(`Failed to send invite email to ${cmd.invitedEmail}`, e);
      // Membership row already committed — don't fail the whole request.
    }

    return saved;
  }
}

export { INVITE_MEMBER_USE_CASE };
