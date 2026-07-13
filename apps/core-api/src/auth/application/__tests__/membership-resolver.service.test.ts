import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MembershipResolver } from '../membership-resolver.service.js';

function makePrisma(membershipRow: Record<string, unknown> | null) {
  return {
    membership: {
      findFirst: vi.fn().mockResolvedValue(membershipRow),
    },
    setOrgContext: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-abc',
    userId: 'user-xyz',
    role: 'ADMIN',
    organization: { subscriptionStatus: 'ACTIVE' },
    ...overrides,
  };
}

describe('MembershipResolver', () => {
  it('returns null when no active membership found', async () => {
    const prisma = makePrisma(null);
    const resolver = new MembershipResolver(prisma as never);
    const result = await resolver.resolveFromSub('unknown-sub');
    expect(result).toBeNull();
  });

  it('resolves ADMIN membership and sets RLS context', async () => {
    const prisma = makePrisma(makeRow());
    const resolver = new MembershipResolver(prisma as never);
    const principal = await resolver.resolveFromSub('user-xyz');
    expect(principal).not.toBeNull();
    expect(principal!.role).toBe('ADMIN');
    expect(principal!.organizationId).toBe('org-abc');
    expect(principal!.subscriptionStatus).toBe('ACTIVE');
    expect(prisma.setOrgContext).toHaveBeenCalledWith('org-abc');
  });

  it('resolves MAINTAINER membership and sets RLS context', async () => {
    const prisma = makePrisma(makeRow({ role: 'MAINTAINER' }));
    const resolver = new MembershipResolver(prisma as never);
    const principal = await resolver.resolveFromSub('user-xyz');
    expect(principal!.role).toBe('MAINTAINER');
    expect(principal!.organizationId).toBe('org-abc');
    expect(prisma.setOrgContext).toHaveBeenCalledWith('org-abc');
  });

  it('SUPER_ADMIN: organizationId is null and RLS context is NOT set', async () => {
    const prisma = makePrisma(makeRow({ role: 'SUPER_ADMIN' }));
    const resolver = new MembershipResolver(prisma as never);
    const principal = await resolver.resolveFromSub('admin-sub');
    expect(principal!.role).toBe('SUPER_ADMIN');
    expect(principal!.organizationId).toBeNull();
    expect(prisma.setOrgContext).not.toHaveBeenCalled();
  });

  it('MEMBER: organizationId is set and RLS context is set', async () => {
    const prisma = makePrisma(makeRow({ role: 'MEMBER' }));
    const resolver = new MembershipResolver(prisma as never);
    const principal = await resolver.resolveFromSub('member-sub');
    expect(principal!.role).toBe('MEMBER');
    expect(principal!.organizationId).toBe('org-abc');
    expect(prisma.setOrgContext).toHaveBeenCalledWith('org-abc');
  });

  it('passes correct query to findFirst (status ACTIVE, correct sub)', async () => {
    const prisma = makePrisma(makeRow());
    const resolver = new MembershipResolver(prisma as never);
    await resolver.resolveFromSub('my-sub');
    expect(prisma.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'my-sub', status: 'ACTIVE' }),
      }),
    );
  });

  it('propagates subscriptionStatus from org into principal', async () => {
    const prisma = makePrisma(makeRow({ organization: { subscriptionStatus: 'PAST_DUE' } }));
    const resolver = new MembershipResolver(prisma as never);
    const principal = await resolver.resolveFromSub('user-xyz');
    expect(principal!.subscriptionStatus).toBe('PAST_DUE');
  });
});
