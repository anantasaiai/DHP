import { Controller, Get, Post, Patch, Delete, Body, Param, Req, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import type { Principal } from '../../../auth/domain/principal.js';
import { RequireRoles } from '../../../auth/infrastructure/rbac.guard.js';
import { mapDomainErrorToHttpException } from '../../../shared-kernel/infrastructure/http/error-mapper.js';
import { NotFoundError } from '../../../shared-kernel/domain/result.js';
import type { AvailabilityRepositoryPort } from '../../domain/ports/outbound/availability-repository.port.js';
import { AVAILABILITY_REPOSITORY_PORT } from '../../domain/ports/outbound/availability-repository.port.js';

const RuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

const CreateScheduleSchema = z.object({
  name: z.string().min(1).max(200),
  timezone: z.string().min(1).max(100),
  isDefault: z.boolean().default(false),
  rules: z.array(RuleSchema).default([]),
});

const UpdateScheduleSchema = CreateScheduleSchema.partial();

const CreateOverrideSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  available: z.boolean(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
});

@ApiTags('Availability')
@ApiBearerAuth()
@RequireRoles('ADMIN', 'MAINTAINER')
@Controller('api/v1/availability')
export class AvailabilityScheduleController {
  constructor(
    @Inject(AVAILABILITY_REPOSITORY_PORT)
    private readonly repo: AvailabilityRepositoryPort,
  ) {}

  @Get('schedules')
  @ApiOperation({ summary: 'List availability schedules (Maintainer+)' })
  async listSchedules(@Req() req: FastifyRequest & { user: Principal }): Promise<unknown> {
    return this.repo.listSchedules(req.user.organizationId!, req.user.userId);
  }

  @Post('schedules')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create availability schedule (Maintainer+)' })
  async createSchedule(@Req() req: FastifyRequest & { user: Principal }, @Body() body: unknown): Promise<unknown> {
    const parsed = CreateScheduleSchema.safeParse(body);
    if (!parsed.success) throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.flatten() });
    const result = await this.repo.createSchedule({ ...parsed.data, ownerUserId: req.user.userId, organizationId: req.user.organizationId! });
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Get('schedules/:id')
  @ApiOperation({ summary: 'Get schedule (Maintainer+)' })
  async getSchedule(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string): Promise<unknown> {
    const s = await this.repo.findSchedule(id, req.user.organizationId!);
    if (!s) throw mapDomainErrorToHttpException(new NotFoundError('Schedule', id));
    return s;
  }

  @Patch('schedules/:id')
  @ApiOperation({ summary: 'Update availability schedule (Maintainer+)' })
  async updateSchedule(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string, @Body() body: unknown): Promise<unknown> {
    const parsed = UpdateScheduleSchema.safeParse(body);
    if (!parsed.success) throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid payload' });
    const result = await this.repo.updateSchedule(id, req.user.organizationId!, parsed.data);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Delete('schedules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete availability schedule (Maintainer+)' })
  async deleteSchedule(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string): Promise<void> {
    const result = await this.repo.deleteSchedule(id, req.user.organizationId!);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
  }

  @Get('schedules/:id/rules')
  @ApiOperation({ summary: 'List rules for a schedule (Maintainer+)' })
  async listRules(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string): Promise<unknown> {
    const rules = await this.repo.listRules(id, req.user.organizationId!);
    if (rules === null) throw mapDomainErrorToHttpException(new NotFoundError('Schedule', id));
    return rules;
  }

  @Post('schedules/:id/rules')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a rule to a schedule (Maintainer+)' })
  async addRule(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string, @Body() body: unknown): Promise<unknown> {
    const parsed = RuleSchema.safeParse(body);
    if (!parsed.success) throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid rule', details: parsed.error.flatten() });
    const result = await this.repo.addRule(id, req.user.organizationId!, parsed.data);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Delete('schedules/:id/rules/:ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a rule from a schedule (Maintainer+)' })
  async removeRule(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string, @Param('ruleId') ruleId: string): Promise<void> {
    const result = await this.repo.removeRule(id, req.user.organizationId!, ruleId);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
  }

  @Get('overrides')
  @ApiOperation({ summary: 'List availability overrides (Maintainer+)' })
  async listOverrides(@Req() req: FastifyRequest & { user: Principal }): Promise<unknown> {
    return this.repo.listOverrides(req.user.organizationId!, req.user.userId);
  }

  @Post('overrides')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create availability override (Maintainer+)' })
  async createOverride(@Req() req: FastifyRequest & { user: Principal }, @Body() body: unknown): Promise<unknown> {
    const parsed = CreateOverrideSchema.safeParse(body);
    if (!parsed.success) throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.flatten() });
    const result = await this.repo.createOverride({ ...parsed.data, date: new Date(parsed.data.date), ownerUserId: req.user.userId, organizationId: req.user.organizationId! });
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Delete('overrides/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete availability override (Maintainer+)' })
  async deleteOverride(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string): Promise<void> {
    const result = await this.repo.deleteOverride(id, req.user.organizationId!);
    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
  }
}
