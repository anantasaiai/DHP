import {
  Controller, Post, Get, Patch, Delete, Body, Param, Req,
  HttpCode, HttpStatus, Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import type { CreateMeetingTypeUseCasePort, UpdateMeetingTypeUseCasePort, ArchiveMeetingTypeUseCasePort } from '../../domain/ports/inbound/meeting-type-use-cases.js';
import {
  CREATE_MEETING_TYPE_USE_CASE,
  UPDATE_MEETING_TYPE_USE_CASE,
  ARCHIVE_MEETING_TYPE_USE_CASE,
} from '../../domain/ports/inbound/meeting-type-use-cases.js';
import { mapDomainErrorToHttpException } from '../../../shared-kernel/infrastructure/http/error-mapper.js';
import { ForbiddenError } from '../../../shared-kernel/domain/result.js';
import type { Principal } from '../../../auth/domain/principal.js';
import type { MeetingTypeRepositoryPort } from '../../domain/ports/outbound/meeting-type-repository.port.js';
import { MEETING_TYPE_REPOSITORY_PORT } from '../../domain/ports/outbound/meeting-type-repository.port.js';

const CONFERENCING_TYPES = ['google_meet', 'zoom', 'teams', 'webex', 'custom'] as const;

const CreateMeetingTypeSchema = z.object({
  slug: z.string(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive(),
  conferencingType: z.enum(CONFERENCING_TYPES),
  bufferBeforeMinutes: z.number().int().min(0).optional(),
  bufferAfterMinutes: z.number().int().min(0).optional(),
  minNoticeMinutes: z.number().int().min(0).optional(),
  maxDaysInFuture: z.number().int().positive().optional(),
  maxPerDay: z.number().int().positive().nullable().optional(),
});

const UpdateMeetingTypeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  durationMinutes: z.number().int().positive().optional(),
  conferencingType: z.enum(CONFERENCING_TYPES).optional(),
  bufferBeforeMinutes: z.number().int().min(0).optional(),
  bufferAfterMinutes: z.number().int().min(0).optional(),
  minNoticeMinutes: z.number().int().min(0).optional(),
  maxDaysInFuture: z.number().int().positive().optional(),
  maxPerDay: z.number().int().positive().nullable().optional(),
});

@ApiTags('Meeting Types')
@ApiBearerAuth()
@Controller('api/v1/meeting-types')
export class MeetingTypeController {
  constructor(
    @Inject(CREATE_MEETING_TYPE_USE_CASE)
    private readonly createUseCase: CreateMeetingTypeUseCasePort,
    @Inject(UPDATE_MEETING_TYPE_USE_CASE)
    private readonly updateUseCase: UpdateMeetingTypeUseCasePort,
    @Inject(ARCHIVE_MEETING_TYPE_USE_CASE)
    private readonly archiveUseCase: ArchiveMeetingTypeUseCasePort,
    @Inject(MEETING_TYPE_REPOSITORY_PORT)
    private readonly repo: MeetingTypeRepositoryPort,
  ) {}

  private requireOrgId(principal: Principal): string {
    if (!principal.organizationId) throw mapDomainErrorToHttpException(new ForbiddenError('Organization membership required'));
    return principal.organizationId;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a meeting type' })
  @ApiResponse({ status: 201, description: 'Meeting type created' })
  async create(@Req() req: FastifyRequest & { user: Principal }, @Body() body: unknown): Promise<unknown> {
    const parsed = CreateMeetingTypeSchema.safeParse(body);
    if (!parsed.success) {
      throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.flatten() });
    }

    const principal = req.user;
    const orgId = this.requireOrgId(principal);
    const result = await this.createUseCase.execute({
      organizationId: orgId,
      ownerUserId: principal.userId,
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description,
      durationMinutes: parsed.data.durationMinutes,
      conferencingType: parsed.data.conferencingType,
      bufferBeforeMinutes: parsed.data.bufferBeforeMinutes,
      bufferAfterMinutes: parsed.data.bufferAfterMinutes,
      minNoticeMinutes: parsed.data.minNoticeMinutes,
      maxDaysInFuture: parsed.data.maxDaysInFuture,
      maxPerDay: parsed.data.maxPerDay ?? undefined,
    });

    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List meeting types for the authenticated user' })
  async list(@Req() req: FastifyRequest & { user: Principal }): Promise<unknown> {
    const principal = req.user;
    return this.repo.findByOwner(principal.userId, this.requireOrgId(principal));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a meeting type by id' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  async getById(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string): Promise<unknown> {
    const principal = req.user;
    const mt = await this.repo.findById(id, this.requireOrgId(principal));
    if (!mt) {
      throw mapDomainErrorToHttpException({ code: 'NOT_FOUND', message: `MeetingType not found: ${id}` });
    }
    return mt;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a meeting type' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  async update(
    @Req() req: FastifyRequest & { user: Principal },
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = UpdateMeetingTypeSchema.safeParse(body);
    if (!parsed.success) {
      throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.flatten() });
    }

    const principal = req.user;
    const orgId = this.requireOrgId(principal);
    const result = await this.updateUseCase.execute({
      id,
      organizationId: orgId,
      patch: parsed.data,
    });

    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
    return result.value;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a meeting type (soft delete)' })
  async archive(@Req() req: FastifyRequest & { user: Principal }, @Param('id') id: string): Promise<void> {
    const principal = req.user;
    const orgId = this.requireOrgId(principal);
    const result = await this.archiveUseCase.execute({
      id,
      organizationId: orgId,
      requestedByUserId: principal.userId,
    });

    if (!result.ok) throw mapDomainErrorToHttpException(result.error);
  }
}
