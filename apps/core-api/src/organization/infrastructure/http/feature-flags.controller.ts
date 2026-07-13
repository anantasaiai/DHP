import { Controller, Get, Put, Delete, Body, Param, Req, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import type { Principal } from '../../../auth/domain/principal.js';
import { RequireRoles } from '../../../auth/infrastructure/rbac.guard.js';
import { mapDomainErrorToHttpException } from '../../../shared-kernel/infrastructure/http/error-mapper.js';
import type { FeatureFlagRepositoryPort } from '../../domain/ports/outbound/feature-flag-repository.port.js';
import { FEATURE_FLAG_REPOSITORY_PORT } from '../../domain/ports/outbound/feature-flag-repository.port.js';

const UpsertFlagSchema = z.object({
  enabled: z.boolean(),
  payload: z.record(z.unknown()).optional().default({}),
});

@ApiTags('Feature Flags')
@ApiBearerAuth()
@RequireRoles('ADMIN')
@Controller('api/v1/feature-flags')
export class FeatureFlagsController {
  constructor(
    @Inject(FEATURE_FLAG_REPOSITORY_PORT)
    private readonly repo: FeatureFlagRepositoryPort,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List feature flags (Org Admin)' })
  async list(@Req() req: FastifyRequest & { user: Principal }): Promise<unknown> {
    return this.repo.listByOrg(req.user.organizationId!);
  }

  @Put(':key')
  @ApiOperation({ summary: 'Set feature flag (Org Admin)' })
  async upsert(
    @Req() req: FastifyRequest & { user: Principal },
    @Param('key') key: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = UpsertFlagSchema.safeParse(body);
    if (!parsed.success) throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid payload' });
    const result = await this.repo.upsert(req.user.organizationId!, key, parsed.data.enabled, parsed.data.payload);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete feature flag (Org Admin)' })
  async remove(@Req() req: FastifyRequest & { user: Principal }, @Param('key') key: string): Promise<void> {
    const result = await this.repo.delete(req.user.organizationId!, key);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
  }
}
