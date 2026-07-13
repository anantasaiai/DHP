import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { PublicEndpoint } from '../../../auth/infrastructure/public-endpoint.decorator.js';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RequireRoles } from '../../../auth/infrastructure/rbac.guard.js';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import type { CreateOrganizationUseCasePort } from '../../domain/ports/inbound/create-organization.use-case.js';
import { CREATE_ORGANIZATION_USE_CASE } from '../../domain/ports/inbound/create-organization.use-case.js';
import type { InviteMemberUseCasePort } from '../../domain/ports/inbound/invite-member.use-case.js';
import { INVITE_MEMBER_USE_CASE } from '../../domain/ports/inbound/invite-member.use-case.js';
import type { RemoveMemberUseCasePort } from '../../domain/ports/inbound/remove-member.use-case.js';
import { REMOVE_MEMBER_USE_CASE } from '../../domain/ports/inbound/remove-member.use-case.js';
import type { AcceptInviteUseCasePort } from '../../domain/ports/inbound/accept-invite.use-case.js';
import { ACCEPT_INVITE_USE_CASE } from '../../domain/ports/inbound/accept-invite.use-case.js';
import type { OrganizationRepositoryPort } from '../../domain/ports/outbound/organization-repository.port.js';
import { ORGANIZATION_REPOSITORY_PORT } from '../../domain/ports/outbound/organization-repository.port.js';
import type { OrgMemberRepositoryPort } from '../../domain/ports/outbound/org-member-repository.port.js';
import { ORG_MEMBER_REPOSITORY_PORT } from '../../domain/ports/outbound/org-member-repository.port.js';
import { mapDomainErrorToHttpException } from '../../../shared-kernel/infrastructure/http/error-mapper.js';
import { NotFoundError, ForbiddenError } from '../../../shared-kernel/domain/result.js';
import type { Principal } from '../../../auth/domain/principal.js';

const CreateOrgSchema = z.object({
  slug: z.string().min(2).max(48),
  name: z.string().min(1).max(200),
  founderEmail: z.string().email().optional(),
});

const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(2).max(48).regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, numbers, and hyphens').optional(),
  senderDisplayName: z.string().max(100).nullable().optional(),
});

const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MAINTAINER', 'MEMBER']),
});

const ChangeMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MAINTAINER', 'MEMBER']),
});

const AcceptInviteSchema = z.object({
  acceptingUserId: z.string().uuid(),
  acceptingEmail: z.string().email(),
  username: z.string().min(1).max(80),
  timezone: z.string().min(1).max(100).optional().default('UTC'),
});

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('api/v1/organizations')
export class OrganizationController {
  constructor(
    @Inject(CREATE_ORGANIZATION_USE_CASE)
    private readonly createOrg: CreateOrganizationUseCasePort,
    @Inject(INVITE_MEMBER_USE_CASE)
    private readonly inviteMember: InviteMemberUseCasePort,
    @Inject(REMOVE_MEMBER_USE_CASE)
    private readonly removeMember: RemoveMemberUseCasePort,
    @Inject(ORGANIZATION_REPOSITORY_PORT)
    private readonly orgRepo: OrganizationRepositoryPort,
    @Inject(ORG_MEMBER_REPOSITORY_PORT)
    private readonly membershipRepo: OrgMemberRepositoryPort,
    @Inject(ACCEPT_INVITE_USE_CASE)
    private readonly acceptInvite: AcceptInviteUseCasePort,
  ) {}

  private requireOrgId(principal: Principal): string {
    if (!principal.organizationId) throw mapDomainErrorToHttpException(new ForbiddenError('Organization membership required'));
    return principal.organizationId;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new organization' })
  @ApiResponse({ status: 201, description: 'Organization created' })
  async create(@Req() req: FastifyRequest & { user: Principal }, @Body() body: unknown): Promise<unknown> {
    const parsed = CreateOrgSchema.safeParse(body);
    if (!parsed.success) {
      throw mapDomainErrorToHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }

    const principal = req.user;
    const result = await this.createOrg.execute({
      slug: parsed.data.slug,
      name: parsed.data.name,
      founderUserId: principal.userId,
      // Use provided email or a placeholder — UserRepository lookup is a team task
      founderEmail: parsed.data.founderEmail ?? 'unknown@dhp.app',
    });

    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current organization' })
  async getMyOrg(@Req() req: FastifyRequest & { user: Principal }): Promise<unknown> {
    const principal = req.user;
    const orgId = this.requireOrgId(principal);
    const org = await this.orgRepo.findById(orgId);
    if (!org) {
      throw mapDomainErrorToHttpException(new NotFoundError('Organization', orgId));
    }
    return org;
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current organization' })
  async updateMyOrg(@Req() req: FastifyRequest & { user: Principal }, @Body() body: unknown): Promise<unknown> {
    const parsed = UpdateOrgSchema.safeParse(body);
    if (!parsed.success) {
      throw mapDomainErrorToHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }

    const principal = req.user;
    const orgId = this.requireOrgId(principal);
    const patch: { name?: string; slug?: string; senderDisplayName?: string | null } = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.slug !== undefined) patch.slug = parsed.data.slug;
    if (parsed.data.senderDisplayName !== undefined)
      patch.senderDisplayName = parsed.data.senderDisplayName;

    const result = await this.orgRepo.update(orgId, patch);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Get('me/members')
  @ApiOperation({ summary: 'List active members of the current organization' })
  async listMembers(@Req() req: FastifyRequest & { user: Principal }): Promise<unknown> {
    const principal = req.user;
    const members = await this.membershipRepo.findActiveByOrgWithUser(this.requireOrgId(principal));
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      status: m.status,
      invitedEmail: m.status === 'ACTIVE' && m.userEmail ? m.userEmail : m.invitedEmail,
      createdAt: m.createdAt,
    }));
  }

  @Post('me/members/invite')
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles('ADMIN')
  @ApiOperation({ summary: 'Invite a member to the current organization' })
  @ApiResponse({ status: 201, description: 'Invite created' })
  async inviteMemberHandler(
    @Req() req: FastifyRequest & { user: Principal },
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = InviteMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw mapDomainErrorToHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }

    const principal = req.user;
    const result = await this.inviteMember.execute({
      organizationId: this.requireOrgId(principal),
      invitedByUserId: principal.userId,
      invitedEmail: parsed.data.email,
      role: parsed.data.role,
    });

    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Delete('me/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRoles('ADMIN')
  @ApiOperation({ summary: 'Remove a member from the current organization' })
  async removeMemberHandler(
    @Req() req: FastifyRequest & { user: Principal },
    @Param('memberId') memberId: string,
  ): Promise<void> {
    const principal = req.user;
    const result = await this.removeMember.execute({
      organizationId: this.requireOrgId(principal),
      actorUserId: principal.userId,
      memberId,
    });

    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
  }

  @Patch('me/members/:memberId/role')
  @RequireRoles('ADMIN')
  @ApiOperation({ summary: 'Change a member\'s role' })
  async changeMemberRoleHandler(
    @Req() req: FastifyRequest & { user: Principal },
    @Param('memberId') memberId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = ChangeMemberRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid role', details: parsed.error.flatten() });
    }
    const orgId = this.requireOrgId(req.user);
    const result = await this.membershipRepo.updateRole(memberId, orgId, parsed.data.role);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Get('setup/status')
  @PublicEndpoint()
  @ApiOperation({ summary: 'Returns whether initial org setup is required' })
  async setupStatus(): Promise<{ setupRequired: boolean }> {
    const { total } = await this.orgRepo.listAll(1, 1);
    return { setupRequired: total === 0 };
  }

  @Get('invites/:token')
  @PublicEndpoint()
  @ApiOperation({ summary: 'Preview invite details (public — shown before login)' })
  async getInvite(@Param('token') token: string): Promise<unknown> {
    const membership = await this.membershipRepo.findByInviteToken(token);
    if (!membership) throw mapDomainErrorToHttpException(new NotFoundError('Invite', token));
    return {
      invitedEmail: membership.invitedEmail,
      role: membership.role,
      organizationId: membership.organizationId,
    };
  }

  @Post('invites/:token/accept')
  @PublicEndpoint()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invite — links OIDC user to membership' })
  async acceptInviteHandler(
    @Param('token') token: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = AcceptInviteSchema.safeParse(body);
    if (!parsed.success) {
      throw mapDomainErrorToHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }

    const result = await this.acceptInvite.execute({
      inviteToken: token,
      acceptingUserId: parsed.data.acceptingUserId,
      acceptingEmail: parsed.data.acceptingEmail,
      username: parsed.data.username,
      timezone: parsed.data.timezone,
    });

    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }
}
