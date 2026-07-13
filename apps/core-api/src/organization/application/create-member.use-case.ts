import { Injectable, Inject } from '@nestjs/common';
import { ok, err, ConflictError } from '../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../shared-kernel/domain/result.js';
import type { UserRepositoryPort } from '../domain/ports/outbound/user-profile-repository.port.js';
import { USER_REPOSITORY_PORT } from '../domain/ports/outbound/user-profile-repository.port.js';
import type { OrgMemberRepositoryPort } from '../domain/ports/outbound/org-member-repository.port.js';
import { ORG_MEMBER_REPOSITORY_PORT } from '../domain/ports/outbound/org-member-repository.port.js';
import type { ClockPort } from '../../shared-kernel/domain/clock.port.js';
import { CLOCK_PORT } from '../../shared-kernel/domain/clock.port.js';
import type { IdGeneratorPort } from '../../shared-kernel/domain/id-generator.port.js';
import { ID_GENERATOR_PORT } from '../../shared-kernel/domain/id-generator.port.js';
import type { UserProfile, OrgMember } from '../domain/model/org-member.js';

export interface CreateMemberCommand {
  readonly username: string;
  readonly email: string;
  readonly timezone: string;
  readonly role: 'ADMIN' | 'MAINTAINER' | 'MEMBER';
  readonly organizationId: string;
  readonly invitedBy: string;
}

export interface CreateMemberResult {
  readonly user: UserProfile;
  readonly membership: OrgMember;
}

export const CREATE_MEMBER_USE_CASE = Symbol('CreateMemberUseCase');

export interface CreateMemberUseCasePort {
  execute(command: CreateMemberCommand): Promise<Result<CreateMemberResult, DomainError>>;
}

@Injectable()
export class CreateMemberUseCase implements CreateMemberUseCasePort {
  constructor(
    @Inject(USER_REPOSITORY_PORT) private readonly userRepo: UserRepositoryPort,
    @Inject(ORG_MEMBER_REPOSITORY_PORT) private readonly membershipRepo: OrgMemberRepositoryPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT) private readonly idGen: IdGeneratorPort,
  ) {}

  async execute(command: CreateMemberCommand): Promise<Result<CreateMemberResult, DomainError>> {
    const existing = await this.userRepo.findByEmail(command.email, command.organizationId);
    if (existing) {
      return err(new ConflictError(`User with email ${command.email} already exists in this organization`));
    }

    const userId = this.idGen.generate();
    const now = this.clock.nowUtc();

    const profileResult = await this.userRepo.upsert({
      id: userId,
      organizationId: command.organizationId,
      username: command.username,
      email: command.email,
      timezone: command.timezone,
      preferencesJson: {},
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    if (!profileResult.ok) return profileResult;

    const membershipResult = await this.membershipRepo.save({
      id: this.idGen.generate(),
      organizationId: command.organizationId,
      userId,
      role: command.role,
      status: 'ACTIVE',
      invitedBy: command.invitedBy,
      invitedEmail: command.email,
      inviteToken: null,
      createdAt: now,
      updatedAt: now,
    });
    if (!membershipResult.ok) return membershipResult;

    return ok({ user: profileResult.value, membership: membershipResult.value });
  }
}
