import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ok, err, NotFoundError, ValidationError } from '../../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../../shared-kernel/domain/result.js';
import type { OrgMemberRepositoryPort } from '../../domain/ports/outbound/org-member-repository.port.js';
import type { OrgMember } from '../../domain/model/org-member.js';
import { PrismaService } from '../../../shared-kernel/infrastructure/persistence/prisma.service.js';

type OrgMemberRow = {
  id: string;
  organizationId: string;
  userId: string | null;
  role: string;
  status: string;
  invitedBy: string | null;
  invitedEmail: string;
  inviteToken: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PrismaOrgMemberRepository implements OrgMemberRepositoryPort {
  private readonly logger = new Logger(PrismaOrgMemberRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<OrgMember | null> {
    const row = await this.prisma.orgMember.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByOrgAndUser(organizationId: string, userId: string): Promise<OrgMember | null> {
    const row = await this.prisma.orgMember.findFirst({
      where: { organizationId, userId },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByInviteToken(token: string): Promise<OrgMember | null> {
    const row = await this.prisma.orgMember.findFirst({
      where: { inviteToken: token, status: 'INVITED' },
    });
    return row ? this.toDomain(row) : null;
  }

  async linkUser(membershipId: string, userId: string): Promise<Result<OrgMember, DomainError>> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // If the user already belongs to another org (e.g. auto-provisioned), vacate that membership
        // so the unique constraint on user_id is satisfied before we set it on the invite row.
        await tx.orgMember.updateMany({
          where: { userId, id: { not: membershipId } },
          data: { userId: null, status: 'REMOVED', updatedAt: new Date() },
        });
        return tx.orgMember.update({
          where: { id: membershipId },
          data: { userId, status: 'ACTIVE', inviteToken: null, updatedAt: new Date() },
        });
      });
      return ok(this.toDomain(row));
    } catch (e) {
      if (this.isNotFound(e)) return err(new NotFoundError('OrgMember', membershipId));
      throw e;
    }
  }

  async findActiveByOrg(organizationId: string): Promise<OrgMember[]> {
    const rows = await this.prisma.orgMember.findMany({
      where: { organizationId, status: { in: ['ACTIVE', 'INVITED'] } },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findActiveByOrgWithUser(organizationId: string): Promise<(OrgMember & { userEmail: string | null; username: string | null })[]> {
    const rows = await this.prisma.orgMember.findMany({
      where: { organizationId, status: { in: ['ACTIVE', 'INVITED'] } },
      include: { user: { select: { email: true, username: true } } },
    });
    return rows.map((r) => ({
      ...this.toDomain(r),
      userEmail: r.user?.email ?? null,
      username: r.user?.username ?? null,
    }));
  }

  async countAdminsByOrg(organizationId: string): Promise<number> {
    return this.prisma.orgMember.count({
      where: { organizationId, role: 'ADMIN', status: 'ACTIVE' },
    });
  }

  async save(membership: OrgMember): Promise<Result<OrgMember, DomainError>> {
    try {
      const row = await this.prisma.orgMember.create({
        data: {
          id: membership.id,
          organizationId: membership.organizationId,
          userId: membership.userId ?? undefined,
          role: membership.role,
          status: membership.status,
          invitedBy: membership.invitedBy,
          invitedEmail: membership.invitedEmail,
          inviteToken: membership.inviteToken,
          createdAt: membership.createdAt,
          updatedAt: membership.updatedAt,
        },
      });
      return ok(this.toDomain(row));
    } catch (e) {
      throw e;
    }
  }

  async updateStatus(id: string, organizationId: string, status: OrgMember['status']): Promise<Result<OrgMember, DomainError>> {
    try {
      const row = await this.prisma.orgMember.update({
        where: { id, organizationId },
        data: { status, updatedAt: new Date() },
      });
      return ok(this.toDomain(row));
    } catch (e) {
      if (this.isNotFound(e)) return err(new NotFoundError('OrgMember', id));
      throw e;
    }
  }

  async updateRole(id: string, organizationId: string, role: OrgMember['role']): Promise<Result<OrgMember, DomainError>> {
    try {
      const row = await this.prisma.orgMember.update({
        where: { id, organizationId },
        data: { role, updatedAt: new Date() },
      });
      return ok(this.toDomain(row));
    } catch (e) {
      if (this.isNotFound(e)) return err(new NotFoundError('OrgMember', id));
      throw e;
    }
  }

  async listAdminsByOrg(organizationId: string): Promise<OrgMember[]> {
    const rows = await this.prisma.orgMember.findMany({
      where: { organizationId, role: 'ADMIN', status: 'ACTIVE' },
      take: 100,
    });
    return rows.map((r) => this.toDomain(r));
  }

  async assignAdmin(organizationId: string, userId: string, invitedEmail: string): Promise<Result<OrgMember, DomainError>> {
    const existing = await this.prisma.orgMember.findUnique({ where: { userId } });
    if (existing && existing.organizationId !== organizationId) {
      return err(new ValidationError(`User ${userId} already belongs to a different organization`));
    }
    const row = existing
      ? await this.prisma.orgMember.update({ where: { userId }, data: { role: 'ADMIN', status: 'ACTIVE' } })
      : await this.prisma.orgMember.create({ data: { id: randomUUID(), organizationId, userId, role: 'ADMIN', status: 'ACTIVE', invitedEmail } });
    return ok(this.toDomain(row));
  }

  async revokeAdmin(organizationId: string, userId: string): Promise<Result<void, DomainError>> {
    const membership = await this.prisma.orgMember.findFirst({ where: { organizationId, userId, role: 'ADMIN' } });
    if (!membership) return err(new NotFoundError('OrgAdmin membership', userId));
    await this.prisma.orgMember.update({ where: { id: membership.id }, data: { status: 'REMOVED' } });
    return ok(undefined);
  }

  private toDomain(row: OrgMemberRow): OrgMember {
    return {
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      role: row.role as OrgMember['role'],
      status: row.status as OrgMember['status'],
      invitedBy: row.invitedBy,
      invitedEmail: row.invitedEmail,
      inviteToken: row.inviteToken,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private isNotFound(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025';
  }
}
