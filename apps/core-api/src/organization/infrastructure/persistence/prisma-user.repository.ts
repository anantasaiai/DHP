import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ok, err, NotFoundError } from '../../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../../shared-kernel/domain/result.js';
import type { UserRepositoryPort } from '../../domain/ports/outbound/user-profile-repository.port.js';
import type { UserProfile } from '../../domain/model/org-member.js';
import { PrismaService } from '../../../shared-kernel/infrastructure/persistence/prisma.service.js';

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, organizationId: string): Promise<UserProfile | null> {
    const row = await this.prisma.user.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    return row ? this.userToDomain(row) : null;
  }

  async findByIdGlobal(id: string): Promise<UserProfile | null> {
    const row = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    return row ? this.userToDomain(row) : null;
  }

  async findByEmail(
    email: string,
    organizationId: string,
  ): Promise<UserProfile | null> {
    const row = await this.prisma.user.findFirst({
      where: { email, organizationId, deletedAt: null },
    });
    return row ? this.userToDomain(row) : null;
  }

  async findByUsername(
    username: string,
    organizationId: string,
  ): Promise<UserProfile | null> {
    const row = await this.prisma.user.findFirst({
      where: { username, organizationId, deletedAt: null },
    });
    return row ? this.userToDomain(row) : null;
  }

  async upsert(profile: UserProfile): Promise<Result<UserProfile, DomainError>> {
    try {
      const data = {
        organizationId: profile.organizationId,
        username: profile.username,
        email: profile.email,
        timezone: profile.timezone,
        preferencesJson: profile.preferencesJson as Prisma.InputJsonValue,
        deletedAt: profile.deletedAt,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      };
      const row = await this.prisma.user.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...data },
        update: data,
      });
      return ok(this.userToDomain(row));
    } catch (e) {
      throw e;
    }
  }

  async updateProfile(
    id: string,
    organizationId: string,
    patch: Partial<Pick<UserProfile, 'username' | 'timezone' | 'preferencesJson'>>,
  ): Promise<Result<UserProfile, DomainError>> {
    try {
      const data: Prisma.UserUpdateInput = { updatedAt: new Date() };
      if (patch.username !== undefined) data.username = patch.username;
      if (patch.timezone !== undefined) data.timezone = patch.timezone;
      if (patch.preferencesJson !== undefined)
        data.preferencesJson = patch.preferencesJson as Prisma.InputJsonValue;

      const row = await this.prisma.user.update({ where: { id, organizationId }, data });
      return ok(this.userToDomain(row));
    } catch (e) {
      if (this.isNotFound(e)) return err(new NotFoundError('User', id));
      throw e;
    }
  }

  async softDelete(
    id: string,
    organizationId: string,
  ): Promise<Result<void, DomainError>> {
    try {
      await this.prisma.user.update({
        where: { id, organizationId },
        data: { deletedAt: new Date() },
      });
      return ok(undefined);
    } catch (e) {
      if (this.isNotFound(e)) return err(new NotFoundError('User', id));
      throw e;
    }
  }

  // ─── Mappers ────────────────────────────────────────────────────────────────

  private userToDomain(row: {
    id: string;
    organizationId: string;
    username: string;
    email: string;
    timezone: string;
    preferencesJson: Prisma.JsonValue;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserProfile {
    return {
      id: row.id,
      organizationId: row.organizationId,
      username: row.username,
      email: row.email,
      timezone: row.timezone,
      preferencesJson: row.preferencesJson as Record<string, unknown>,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private isNotFound(e: unknown): boolean {
    return (
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025'
    );
  }
}
