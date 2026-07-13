import { Inject, Injectable } from '@nestjs/common';
import { ok, err, ValidationError } from '../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../shared-kernel/domain/result.js';
import { SlugPolicy } from '../../shared-kernel/domain/slug-policy.js';
import type { Organization } from '../domain/model/organization.js';
import type { CreateOrganizationCommand, CreateOrganizationUseCasePort } from '../domain/ports/inbound/create-organization.use-case.js';
import { CREATE_ORGANIZATION_USE_CASE } from '../domain/ports/inbound/create-organization.use-case.js';
import type { OrganizationRepositoryPort } from '../domain/ports/outbound/organization-repository.port.js';
import { ORGANIZATION_REPOSITORY_PORT } from '../domain/ports/outbound/organization-repository.port.js';
import type { OrgMemberRepositoryPort } from '../domain/ports/outbound/org-member-repository.port.js';
import { ORG_MEMBER_REPOSITORY_PORT } from '../domain/ports/outbound/org-member-repository.port.js';
import type { ClockPort } from '../../shared-kernel/domain/clock.port.js';
import { CLOCK_PORT } from '../../shared-kernel/domain/clock.port.js';
import type { IdGeneratorPort } from '../../shared-kernel/domain/id-generator.port.js';
import { ID_GENERATOR_PORT } from '../../shared-kernel/domain/id-generator.port.js';

@Injectable()
export class CreateOrganizationUseCase implements CreateOrganizationUseCasePort {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY_PORT)
    private readonly orgRepo: OrganizationRepositoryPort,
    @Inject(ORG_MEMBER_REPOSITORY_PORT)
    private readonly membershipRepo: OrgMemberRepositoryPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly idGen: IdGeneratorPort,
  ) {}

  async execute(cmd: CreateOrganizationCommand): Promise<Result<Organization, DomainError>> {
    if (!SlugPolicy.isValid(cmd.slug)) {
      return err(new ValidationError(SlugPolicy.errorMessage));
    }

    const slugTaken = await this.orgRepo.slugExists(cmd.slug);
    if (slugTaken) {
      return err(new ValidationError(`Slug "${cmd.slug}" is already taken`));
    }

    const now = this.clock.nowUtc();
    const orgId = this.idGen.generate();

    const org: Organization = {
      id: orgId,
      slug: cmd.slug,
      name: cmd.name,
      brandingJson: null,
      senderDisplayName: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const saveResult = await this.orgRepo.save(org);
    if (!saveResult.ok) return saveResult;

    // Founder becomes the first ADMIN member (ACTIVE, no invite required)
    const membershipResult = await this.membershipRepo.save({
      id: this.idGen.generate(),
      organizationId: orgId,
      userId: cmd.founderUserId,
      role: 'ADMIN',
      status: 'ACTIVE',
      invitedBy: null,
      invitedEmail: cmd.founderEmail,
      inviteToken: null,
      createdAt: now,
      updatedAt: now,
    });
    if (!membershipResult.ok) return err(membershipResult.error);

    return ok(saveResult.value);
  }
}

export { CREATE_ORGANIZATION_USE_CASE };
