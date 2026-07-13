import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        ...(process.env['PRISMA_QUERY_LOG'] === 'true'
          ? [{ emit: 'event' as const, level: 'query' as const }]
          : []),
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async setOrgContext(organizationId: string): Promise<void> {
    await this.$queryRaw(Prisma.sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`);
  }
}
