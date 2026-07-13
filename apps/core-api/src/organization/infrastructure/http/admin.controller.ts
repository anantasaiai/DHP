import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { RequireRoles } from '../../../auth/infrastructure/rbac.guard.js';
import { mapDomainErrorToHttpException } from '../../../shared-kernel/infrastructure/http/error-mapper.js';
import { NotFoundError } from '../../../shared-kernel/domain/result.js';
import type { OrganizationRepositoryPort } from '../../domain/ports/outbound/organization-repository.port.js';
import { ORGANIZATION_REPOSITORY_PORT } from '../../domain/ports/outbound/organization-repository.port.js';
import type { OrgMemberRepositoryPort } from '../../domain/ports/outbound/org-member-repository.port.js';
import { ORG_MEMBER_REPOSITORY_PORT } from '../../domain/ports/outbound/org-member-repository.port.js';
import type { CreateOrganizationUseCasePort } from '../../domain/ports/inbound/create-organization.use-case.js';
import { CREATE_ORGANIZATION_USE_CASE } from '../../domain/ports/inbound/create-organization.use-case.js';

const CreateOrgSchema = z.object({
  slug: z.string().min(2).max(48).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  founderEmail: z.string().email().optional().default('admin@dhp.app'),
});
const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  senderDisplayName: z.string().max(100).nullable().optional(),
});
const AssignAdminSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
});
const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

@ApiTags('Admin')
@ApiBearerAuth()
@RequireRoles('SUPER_ADMIN')
@Controller('api/v1/admin')
export class AdminController {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY_PORT) private readonly orgRepo: OrganizationRepositoryPort,
    @Inject(ORG_MEMBER_REPOSITORY_PORT) private readonly membershipRepo: OrgMemberRepositoryPort,
    @Inject(CREATE_ORGANIZATION_USE_CASE) private readonly createOrg: CreateOrganizationUseCasePort,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard stats (Super Admin)' })
  async getStats(): Promise<unknown> {
    return this.orgRepo.getDashboardStats();
  }

  @Get('organizations')
  @ApiOperation({ summary: 'List all organizations (Super Admin)' })
  async listOrgs(@Query() query: unknown): Promise<unknown> {
    const { page, limit } = PaginationSchema.parse(query);
    return this.orgRepo.listAll(page, limit);
  }

  @Post('organizations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create organization (Super Admin)' })
  async createOrgHandler(@Body() body: unknown): Promise<unknown> {
    const parsed = CreateOrgSchema.safeParse(body);
    if (!parsed.success) throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.flatten() });
    const result = await this.createOrg.execute({
      slug: parsed.data.slug,
      name: parsed.data.name,
      founderUserId: 'system',
      founderEmail: parsed.data.founderEmail,
    });
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Get('organizations/:id')
  @ApiOperation({ summary: 'Get organization (Super Admin)' })
  async getOrg(@Param('id') id: string): Promise<unknown> {
    const org = await this.orgRepo.findById(id);
    if (!org) throw mapDomainErrorToHttpException(new NotFoundError('Organization', id));
    return org;
  }

  @Patch('organizations/:id')
  @ApiOperation({ summary: 'Update organization (Super Admin)' })
  async updateOrg(@Param('id') id: string, @Body() body: unknown): Promise<unknown> {
    const parsed = UpdateOrgSchema.safeParse(body);
    if (!parsed.success) throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid payload' });
    const result = await this.orgRepo.update(id, parsed.data);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Delete('organizations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete organization (Super Admin)' })
  async deleteOrg(@Param('id') id: string): Promise<void> {
    const result = await this.orgRepo.softDelete(id);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
  }

  @Get('organizations/:orgId/admins')
  @ApiOperation({ summary: 'List org admins (Super Admin)' })
  async listAdmins(@Param('orgId') orgId: string): Promise<unknown> {
    return this.membershipRepo.listAdminsByOrg(orgId);
  }

  @Post('organizations/:orgId/admins')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign org admin (Super Admin)' })
  async assignAdmin(@Param('orgId') orgId: string, @Body() body: unknown): Promise<unknown> {
    const parsed = AssignAdminSchema.safeParse(body);
    if (!parsed.success) throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid payload' });
    const result = await this.membershipRepo.assignAdmin(orgId, parsed.data.userId, parsed.data.email);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Delete('organizations/:orgId/admins/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke org admin (Super Admin)' })
  async revokeAdmin(@Param('orgId') orgId: string, @Param('userId') userId: string): Promise<void> {
    const result = await this.membershipRepo.revokeAdmin(orgId, userId);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
  }
}
