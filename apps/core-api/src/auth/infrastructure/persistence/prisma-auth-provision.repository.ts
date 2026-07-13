import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SubscriptionStatus } from '@dhp/types';
import type { MemberRole } from '../../../organization/domain/model/org-member.js';
import { PrismaService } from '../../../shared-kernel/infrastructure/persistence/prisma.service.js';
import type { Principal } from '../../domain/principal.js';
import type { AuthProvisionPort, ProvisionUserInput } from '../../domain/ports/outbound/auth-provision.port.js';

@Injectable()
export class PrismaAuthProvisionRepository implements AuthProvisionPort {
  constructor(private readonly prisma: PrismaService) {}

  async findExistingPrincipal(sub: string): Promise<Principal | null> {
    const membership = await this.prisma.orgMember.findFirst({
      where: { userId: sub, status: 'ACTIVE' },
      select: {
        userId: true,
        organizationId: true,
        role: true,
        organization: { select: { subscriptionStatus: true } },
      },
    });

    if (!membership || !membership.userId) return null;

    const user = await this.prisma.user.findUnique({ where: { id: sub } });

    return {
      userId: membership.userId,
      organizationId: membership.organizationId,
      role: membership.role as MemberRole,
      subscriptionStatus: membership.organization.subscriptionStatus as SubscriptionStatus,
      username: user?.username ?? null,
      email: user?.email ?? null,
    };
  }

  async createOrgAndUser(input: ProvisionUserInput): Promise<Principal> {
    const username = input.email.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'user';

    // If a pending invite exists for this email, accept it instead of creating a new org.
    const pendingInvite = await this.prisma.orgMember.findFirst({
      where: { invitedEmail: { equals: input.email, mode: 'insensitive' }, status: 'INVITED', userId: null },
      include: { organization: { select: { subscriptionStatus: true } } },
    });

    if (pendingInvite) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.current_organization_id', ${pendingInvite.organizationId}, true)`;
        await tx.user.create({
          data: { id: input.sub, organizationId: pendingInvite.organizationId, username, email: input.email },
        });
        await tx.orgMember.update({
          where: { id: pendingInvite.id },
          data: { userId: input.sub, status: 'ACTIVE', inviteToken: null },
        });
      });

      return {
        userId: input.sub,
        organizationId: pendingInvite.organizationId,
        role: pendingInvite.role as MemberRole,
        subscriptionStatus: pendingInvite.organization.subscriptionStatus as SubscriptionStatus,
        username,
        email: input.email,
      };
    }

    // No pending invite — create a brand new org for this user.
    const orgId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.current_organization_id', ${orgId}, true)`;

      await tx.organization.create({
        data: {
          id: orgId,
          slug: `org-${orgId.slice(0, 8)}`,
          name: input.name || username,
          subscriptionStatus: 'TRIALING',
        },
      });

      await tx.user.create({
        data: { id: input.sub, organizationId: orgId, username, email: input.email },
      });

      await tx.orgMember.create({
        data: { organizationId: orgId, userId: input.sub, role: 'ADMIN', status: 'ACTIVE', invitedEmail: input.email },
      });
    });

    return {
      userId: input.sub,
      organizationId: orgId,
      role: 'ADMIN' as MemberRole,
      subscriptionStatus: 'TRIALING' as SubscriptionStatus,
      username,
      email: input.email,
    };
  }
}
