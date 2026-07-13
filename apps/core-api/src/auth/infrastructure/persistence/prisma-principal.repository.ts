import { Injectable } from '@nestjs/common';
import type { SubscriptionStatus } from '@dhp/types';
import type { MemberRole } from '../../../organization/domain/model/org-member.js';
import { PrismaService } from '../../../shared-kernel/infrastructure/persistence/prisma.service.js';
import type { Principal } from '../../domain/principal.js';
import type { PrincipalRepositoryPort } from '../../domain/ports/outbound/principal-repository.port.js';

@Injectable()
export class PrismaPrincipalRepository implements PrincipalRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async resolveFromSub(sub: string): Promise<Principal | null> {
    const membership = await this.prisma.orgMember.findFirst({
      where: { userId: sub, status: 'ACTIVE' },
      select: {
        organizationId: true,
        userId: true,
        role: true,
        organization: { select: { subscriptionStatus: true } },
      },
    });

    if (!membership || !membership.userId) return null;

    const role = membership.role as MemberRole;
    const user = await this.prisma.user.findUnique({ where: { id: sub } });

    return {
      userId: membership.userId,
      organizationId: role === 'SUPER_ADMIN' ? null : membership.organizationId,
      role,
      subscriptionStatus: membership.organization.subscriptionStatus as SubscriptionStatus,
      username: user?.username ?? null,
      email: user?.email ?? null,
    };
  }
}
