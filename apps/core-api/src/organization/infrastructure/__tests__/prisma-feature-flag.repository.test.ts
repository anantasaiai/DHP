import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaFeatureFlagRepository } from '../persistence/prisma-feature-flag.repository.js';

function makePrisma() {
  return {
    featureFlag: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function makeFlagRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    organizationId: 'org-1',
    key: 'dark_mode',
    enabled: true,
    payload: {},
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('PrismaFeatureFlagRepository — unit', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: PrismaFeatureFlagRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new PrismaFeatureFlagRepository(prisma as never);
  });

  describe('listByOrg', () => {
    it('queries by organizationId ordered by key', async () => {
      prisma.featureFlag.findMany.mockResolvedValue([]);
      await repo.listByOrg('org-1');
      expect(prisma.featureFlag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' }, orderBy: { key: 'asc' } })
      );
    });

    it('maps rows to FeatureFlag DTOs', async () => {
      prisma.featureFlag.findMany.mockResolvedValue([makeFlagRow()]);
      const result = await repo.listByOrg('org-1');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'f1', key: 'dark_mode', enabled: true });
    });
  });

  describe('upsert', () => {
    it('calls prisma upsert with correct composite key', async () => {
      prisma.featureFlag.upsert.mockResolvedValue(makeFlagRow());
      const result = await repo.upsert('org-1', 'dark_mode', true, {});
      expect(result.ok).toBe(true);
      expect(prisma.featureFlag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId_key: { organizationId: 'org-1', key: 'dark_mode' } } })
      );
    });

    it('passes enabled=false correctly', async () => {
      const row = makeFlagRow({ enabled: false });
      prisma.featureFlag.upsert.mockResolvedValue(row);
      const result = await repo.upsert('org-1', 'flag-x', false, {});
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.enabled).toBe(false);
    });
  });

  describe('delete', () => {
    it('returns ok on successful delete', async () => {
      prisma.featureFlag.delete.mockResolvedValue(makeFlagRow());
      const result = await repo.delete('org-1', 'dark_mode');
      expect(result.ok).toBe(true);
    });

    it('returns err(NotFoundError) on P2025', async () => {
      const { Prisma } = await import('@prisma/client');
      prisma.featureFlag.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Not found', { code: 'P2025', clientVersion: '5.0.0', meta: {} })
      );
      const result = await repo.delete('org-1', 'missing');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });
  });
});
