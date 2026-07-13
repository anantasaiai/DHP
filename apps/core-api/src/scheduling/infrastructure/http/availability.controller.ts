import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import type { Principal } from '../../../auth/domain/principal.js';
import { mapDomainErrorToHttpException } from '../../../shared-kernel/infrastructure/http/error-mapper.js';
import { NotImplementedError } from '../../../shared-kernel/domain/result.js';

const GetSlotsQuerySchema = z.object({
  hostId: z.string().uuid(),
  meetingTypeId: z.string().uuid(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1).max(100).default('UTC'),
});

@ApiTags('Availability')
@ApiBearerAuth()
@Controller('api/v1/availability')
export class AvailabilityController {
  @Get('slots')
  @ApiOperation({ summary: 'Get available slots for a host + meeting type' })
  @ApiResponse({ status: 200, description: 'List of available intervals' })
  @ApiResponse({ status: 501, description: 'Not yet implemented' })
  async getSlots(@Req() req: FastifyRequest & { user: Principal }, @Query() rawQuery: unknown): Promise<unknown> {
    const parsed = GetSlotsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw mapDomainErrorToHttpException({ code: 'VALIDATION_ERROR', message: 'Invalid query params', details: parsed.error.flatten() });
    }
    void req;
    throw mapDomainErrorToHttpException(new NotImplementedError('availability-slots'));
  }
}
