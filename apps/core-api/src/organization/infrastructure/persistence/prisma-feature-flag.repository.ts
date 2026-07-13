import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ok, err, NotFoundError } from '../../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../../shared-kernel/domain/result.js';
import type { FeatureFlagRepositoryPort } from '../../domain/ports/outbound/feature-flag-repository.port.js';
import type { FeatureFlag } from '../../domain/model/feature-flag.js';
import { PrismaService } from '../../../shared-kernel/infrastructure/persistence/prisma.service.js';
import { randomUUID } from 'node:crypto';

@Injectable()
export class PrismaFeatureFlagRepository implements FeatureFlagRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listByOrg(organizationId: string): Promise<FeatureFlag[]> {
    const rows = await this.prisma.featureFlag.findMany({ where: { organizationId }, orderBy: { key: 'asc' } });
    return rows.map((r) => this.toDomain(r));
  }

  async findByKey(organizationId: string, key: string): Promise<FeatureFlag | null> {
    const row = await this.prisma.featureFlag.findFirst({ where: { organizationId, key } });
    return row ? this.toDomain(row) : null;
  }

  async upsert(organizationId: string, key: string, enabled: boolean, payload: Record<string, unknown>): Promise<Result<FeatureFlag, DomainError>> {
    const row = await this.prisma.featureFlag.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: { id: randomUUID(), organizationId, key, enabled, payload: payload as Prisma.InputJsonValue },
      update: { enabled, payload: payload as Prisma.InputJsonValue },
    });
    return ok(this.toDomain(row));
  }

  async delete(organizationId: string, key: string): Promise<Result<void, DomainError>> {
    try {
      await this.prisma.featureFlag.delete({ where: { organizationId_key: { organizationId, key } } });
      return ok(undefined);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return err(new NotFoundError('FeatureFlag', key));
      }
      throw e;
    }
  }

  private toDomain(r: { id: string; organizationId: string; key: string; enabled: boolean; payload: Prisma.JsonValue; createdAt: Date; updatedAt: Date }): FeatureFlag {
    return { id: r.id, organizationId: r.organizationId, key: r.key, enabled: r.enabled, payload: r.payload as Record<string, unknown>, createdAt: r.createdAt, updatedAt: r.updatedAt };
  }
}
