import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ok, err, ValidationError, NotFoundError } from '../../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../../shared-kernel/domain/result.js';
import type { OrganizationRepositoryPort, DashboardStats } from '../../domain/ports/outbound/organization-repository.port.js';
import type { Organization } from '../../domain/model/organization.js';
import { PrismaService } from '../../../shared-kernel/infrastructure/persistence/prisma.service.js';

@Injectable()
export class PrismaOrganizationRepository implements OrganizationRepositoryPort {
  private readonly logger = new Logger(PrismaOrganizationRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Organization | null> {
    const row = await this.prisma.organization.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const row = await this.prisma.organization.findFirst({ where: { slug, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async slugExists(slug: string): Promise<boolean> {
    const count = await this.prisma.organization.count({ where: { slug } });
    return count > 0;
  }

  async listAll(page: number, limit: number): Promise<{ items: Organization[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.organization.count({ where: { deletedAt: null } }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [totalOrganizations, totalUsers, totalBookings, activeSubscriptions, bookingsThisMonth] =
      await this.prisma.$transaction([
        this.prisma.organization.count({ where: { deletedAt: null } }),
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.booking.count(),
        this.prisma.organization.count({ where: { deletedAt: null, subscriptionStatus: { in: ['ACTIVE', 'TRIALING'] } } }),
        this.prisma.booking.count({ where: { createdAt: { gte: startOfMonth } } }),
      ]);
    return { totalOrganizations, totalUsers, totalBookings, activeSubscriptions, bookingsThisMonth };
  }

  async save(org: Organization): Promise<Result<Organization, DomainError>> {
    try {
      const row = await this.prisma.organization.create({
        data: {
          id: org.id,
          slug: org.slug,
          name: org.name,
          brandingJson: (org.brandingJson as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
          senderDisplayName: org.senderDisplayName,
          deletedAt: org.deletedAt,
          createdAt: org.createdAt,
          updatedAt: org.updatedAt,
        },
      });
      return ok(this.toDomain(row));
    } catch (e) {
      if (this.isUniqueViolation(e)) return err(new ValidationError('Slug already taken'));
      throw e;
    }
  }

  async update(
    id: string,
    patch: Partial<Pick<Organization, 'name' | 'slug' | 'brandingJson' | 'senderDisplayName'>>,
  ): Promise<Result<Organization, DomainError>> {
    try {
      const data: Prisma.OrganizationUpdateInput = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.slug !== undefined) data.slug = patch.slug;
      if (patch.brandingJson !== undefined)
        data.brandingJson = (patch.brandingJson as Prisma.InputJsonValue | null) ?? Prisma.JsonNull;
      if (patch.senderDisplayName !== undefined) data.senderDisplayName = patch.senderDisplayName;
      const row = await this.prisma.organization.update({ where: { id }, data });
      return ok(this.toDomain(row));
    } catch (e) {
      if (this.isNotFound(e)) return err(new NotFoundError('Organization', id));
      throw e;
    }
  }

  async softDelete(id: string): Promise<Result<void, DomainError>> {
    try {
      await this.prisma.organization.update({ where: { id }, data: { deletedAt: new Date() } });
      return ok(undefined);
    } catch (e) {
      if (this.isNotFound(e)) return err(new NotFoundError('Organization', id));
      throw e;
    }
  }

  private toDomain(row: {
    id: string; slug: string; name: string;
    brandingJson: Prisma.JsonValue; senderDisplayName: string | null;
    deletedAt: Date | null; createdAt: Date; updatedAt: Date;
  }): Organization {
    return {
      id: row.id, slug: row.slug, name: row.name,
      brandingJson: row.brandingJson !== null ? (row.brandingJson as Record<string, unknown>) : null,
      senderDisplayName: row.senderDisplayName,
      deletedAt: row.deletedAt, createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
  }

  private isUniqueViolation(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
  }

  private isNotFound(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025';
  }
}
