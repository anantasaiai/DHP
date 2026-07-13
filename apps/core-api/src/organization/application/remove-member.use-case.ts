import { Inject, Injectable } from '@nestjs/common';
import { ok, err, ValidationError, ForbiddenError, NotFoundError } from '../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../shared-kernel/domain/result.js';
import type { RemoveMemberCommand, RemoveMemberUseCasePort } from '../domain/ports/inbound/remove-member.use-case.js';
import { REMOVE_MEMBER_USE_CASE } from '../domain/ports/inbound/remove-member.use-case.js';
import type { OrgMemberRepositoryPort } from '../domain/ports/outbound/org-member-repository.port.js';
import { ORG_MEMBER_REPOSITORY_PORT } from '../domain/ports/outbound/org-member-repository.port.js';

@Injectable()
export class RemoveMemberUseCase implements RemoveMemberUseCasePort {
  constructor(
    @Inject(ORG_MEMBER_REPOSITORY_PORT)
    private readonly membershipRepo: OrgMemberRepositoryPort,
  ) {}

  async execute(cmd: RemoveMemberCommand): Promise<Result<void, DomainError>> {
    // Load actor's membership — must be ADMIN in this org
    const actorMembership = await this.membershipRepo.findByOrgAndUser(
      cmd.organizationId,
      cmd.actorUserId,
    );
    if (!actorMembership || actorMembership.role !== 'ADMIN' || actorMembership.status !== 'ACTIVE') {
      return err(new ForbiddenError('Only active organization admins can remove members'));
    }

    // Load target membership by row ID (works for invited members with no userId)
    const targetMembership = await this.membershipRepo.findById(cmd.memberId);
    if (!targetMembership || targetMembership.organizationId !== cmd.organizationId) {
      return err(new NotFoundError('Membership', cmd.memberId));
    }

    // Prevent self-removal
    if (targetMembership.userId === cmd.actorUserId) {
      return err(new ValidationError('You cannot remove yourself from the organization'));
    }

    // Prevent removing the last admin
    if (targetMembership.role === 'ADMIN') {
      const adminCount = await this.membershipRepo.countAdminsByOrg(cmd.organizationId);
      if (adminCount <= 1) {
        return err(new ValidationError('Cannot remove the last admin'));
      }
    }

    const updateResult = await this.membershipRepo.updateStatus(
      targetMembership.id,
      cmd.organizationId,
      'REMOVED',
    );
    if (!updateResult.ok) return err(updateResult.error);

    return ok(undefined);
  }
}

export { REMOVE_MEMBER_USE_CASE };
