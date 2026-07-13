import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

// ── Cross-cutting modules ─────────────────────────────────────────────────────
import { SharedKernelModule } from './shared-kernel/shared-kernel.module.js';
import { SchedulingModule } from './scheduling/scheduling.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OrganizationModule } from './organization/organization.module.js';

// ── Shared infrastructure ─────────────────────────────────────────────────────
import { PrismaModule } from './shared-kernel/infrastructure/persistence/prisma.module.js';

// ── HTTP controllers ──────────────────────────────────────────────────────────
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        ...(process.env['NODE_ENV'] !== 'production' && {
          transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
        }),
        customProps: () => ({ service: 'core-api' }),
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        serializers: {
          req: (req: { method: string; url: string; id: string }) => ({
            method: req.method,
            url: req.url,
            id: req.id,
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    SharedKernelModule,
    AuthModule,
    SchedulingModule,
    OrganizationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
