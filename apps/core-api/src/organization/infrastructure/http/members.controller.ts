import { Controller, Get, Post, Patch, Delete, Body, Param, Req, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import type { Principal } from '../../../auth/domain/principal.js';
import { RequireRoles } from '../../../auth/infrastructure/rbac.guard.js';
import { mapDomainErrorToHttpException } from '../../../shared-kernel/infrastructure/http/error-mapper.js';
import { NotFoundError, ForbiddenError } from '../../../shared-kernel/domain/result.js';
import type { UserRepositoryPort } from '../../domain/ports/outbound/user-profile-repository.port.js';
import { USER_REPOSITORY_PORT } from '../../domain/ports/outbound/user-profile-repository.port.js';
import type { OrgMemberRepositoryPort } from '../../domain/ports/outbound/org-member-repository.port.js';
import { ORG_MEMBER_REPOSITORY_PORT } from '../../domain/ports/outbound/org-member-repository.port.js';
import type { CreateMemberUseCasePort } from '../../application/create-member.use-case.js';
import { CREATE_MEMBER_USE_CASE } from '../../application/create-member.use-case.js';

const CreateMemberSchema = z.object({
  username: z.string().min(1).max(80),
  email: z.string().email(),
  timezone: z.string().min(1).max(100).optional().default('UTC'),
  role: z.enum(['ADMIN', 'MAINTAINER', 'MEMBER']).optional().default('MEMBER'),
});

const UpdateProfileSchema = z.object({
  username: z.string().min(1).max(80).optional(),
  timezone: z.string().min(1).max(100).optional(),
  preferencesJson: z.record(z.unknown()).optional(),
});

const UpdateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MAINTAINER', 'MEMBER']),
});

@ApiTags('Members')
@ApiBearerAuth()
@RequireRoles('ADMIN')
@Controller('api/v1/users')
export class MembersController {
  constructor(
    @Inject(USER_REPOSITORY_PORT) private readonly userRepo: UserRepositoryPort,
    @Inject(ORG_MEMBER_REPOSITORY_PORT) private readonly membershipRepo: OrgMemberRepositoryPort,
    @Inject(CREATE_MEMBER_USE_CASE) private readonly createMember: CreateMemberUseCasePort,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List org members (Org Admin)' })
  async list(@Req() req: FastifyRequest & { user: Principal }): Promise<unknown> {
    return this.membershipRepo.findActiveByOrg(req.user.organizationId!);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create member and add to org (Org Admin)' })
  async create(@Req() req: FastifyRequest & { user: Principal }, @Body() body: unknown): Promise<unknown> {
    const parsed = CreateMemberSchema.safeParse(body);
    if (!parsed.success) throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.flatten() });
    const result = await this.createMember.execute({
      username: parsed.data.username,
      email: parsed.data.email,
      timezone: parsed.data.timezone,
      role: parsed.data.role,
      organizationId: req.user.organizationId!,
      invitedBy: req.user.userId,
    });
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get member profile (Org Admin)' })
  async getOne(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string): Promise<unknown> {
    const user = await this.userRepo.findById(id, req.user.organizationId!);
    if (!user) throw mapDomainErrorToHttpException(new NotFoundError('User', id));
    return user;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update member profile (Org Admin)' })
  async update(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string, @Body() body: unknown): Promise<unknown> {
    const parsed = UpdateProfileSchema.safeParse(body);
    if (!parsed.success) throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid payload' });
    const result = await this.userRepo.updateProfile(id, req.user.organizationId!, parsed.data);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove member from org (Org Admin)' })
  async remove(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string): Promise<void> {
    if (id === req.user.userId) throw mapDomainErrorToHttpException(new ForbiddenError('Cannot remove yourself'));
    const result = await this.userRepo.softDelete(id, req.user.organizationId!);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Change member role (Org Admin)' })
  async updateRole(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string, @Body() body: unknown): Promise<unknown> {
    const parsed = UpdateRoleSchema.safeParse(body);
    if (!parsed.success) throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid role' });
    if (id === req.user.userId) throw mapDomainErrorToHttpException(new ForbiddenError('Cannot change your own role'));
    const membership = await this.membershipRepo.findByOrgAndUser(req.user.organizationId!, id);
    if (!membership) throw mapDomainErrorToHttpException(new NotFoundError('Membership', id));
    const result = await this.membershipRepo.updateRole(membership.id, req.user.organizationId!, parsed.data.role);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }
}
