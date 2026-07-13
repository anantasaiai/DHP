import { Module } from '@nestjs/common';
import { ORGANIZATION_REPOSITORY_PORT } from './domain/ports/outbound/organization-repository.port.js';
import { ORG_MEMBER_REPOSITORY_PORT } from './domain/ports/outbound/org-member-repository.port.js';
import { USER_REPOSITORY_PORT } from './domain/ports/outbound/user-profile-repository.port.js';
import { INVITE_MAILER_PORT } from './domain/ports/outbound/invite-mailer.port.js';
import { CREATE_ORGANIZATION_USE_CASE } from './domain/ports/inbound/create-organization.use-case.js';
import { INVITE_MEMBER_USE_CASE } from './domain/ports/inbound/invite-member.use-case.js';
import { REMOVE_MEMBER_USE_CASE } from './domain/ports/inbound/remove-member.use-case.js';
import { ACCEPT_INVITE_USE_CASE } from './domain/ports/inbound/accept-invite.use-case.js';
import { CREATE_MEMBER_USE_CASE } from './application/create-member.use-case.js';
import { FEATURE_FLAG_REPOSITORY_PORT } from './domain/ports/outbound/feature-flag-repository.port.js';
import { PrismaOrganizationRepository } from './infrastructure/persistence/prisma-organization.repository.js';
import { PrismaOrgMemberRepository } from './infrastructure/persistence/prisma-org-member.repository.js';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository.js';
import { SendGridInviteMailer } from './infrastructure/email/sendgrid-invite-mailer.js';
import { CreateOrganizationUseCase } from './application/create-organization.use-case.js';
import { InviteMemberUseCase } from './application/invite-member.use-case.js';
import { RemoveMemberUseCase } from './application/remove-member.use-case.js';
import { AcceptInviteUseCase } from './application/accept-invite.use-case.js';
import { CreateMemberUseCase } from './application/create-member.use-case.js';
import { PrismaFeatureFlagRepository } from './infrastructure/persistence/prisma-feature-flag.repository.js';
import { OrganizationController } from './infrastructure/http/organization.controller.js';
import { MembersController } from './infrastructure/http/members.controller.js';
import { AdminController } from './infrastructure/http/admin.controller.js';
import { FeatureFlagsController } from './infrastructure/http/feature-flags.controller.js';

@Module({
  controllers: [OrganizationController, MembersController, AdminController, FeatureFlagsController],
  providers: [
    { provide: ORGANIZATION_REPOSITORY_PORT, useClass: PrismaOrganizationRepository },
    { provide: ORG_MEMBER_REPOSITORY_PORT, useClass: PrismaOrgMemberRepository },
    { provide: USER_REPOSITORY_PORT, useClass: PrismaUserRepository },
    { provide: INVITE_MAILER_PORT, useClass: SendGridInviteMailer },
    { provide: CREATE_ORGANIZATION_USE_CASE, useClass: CreateOrganizationUseCase },
    { provide: INVITE_MEMBER_USE_CASE, useClass: InviteMemberUseCase },
    { provide: REMOVE_MEMBER_USE_CASE, useClass: RemoveMemberUseCase },
    { provide: ACCEPT_INVITE_USE_CASE, useClass: AcceptInviteUseCase },
    { provide: CREATE_MEMBER_USE_CASE, useClass: CreateMemberUseCase },
    { provide: FEATURE_FLAG_REPOSITORY_PORT, useClass: PrismaFeatureFlagRepository },
  ],
})
export class OrganizationModule {}
