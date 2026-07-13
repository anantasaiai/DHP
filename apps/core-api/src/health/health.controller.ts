import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PublicEndpoint } from '../auth/infrastructure/public-endpoint.decorator.js';

@ApiTags('Health')
@Controller()
export class HealthController {
  @Get('health')
  @PublicEndpoint()
  @ApiOperation({ summary: 'Liveness check' })
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('readiness')
  @PublicEndpoint()
  @ApiOperation({ summary: 'Readiness check' })
  readiness(): { status: string } {
    return { status: 'ok' };
  }
}
