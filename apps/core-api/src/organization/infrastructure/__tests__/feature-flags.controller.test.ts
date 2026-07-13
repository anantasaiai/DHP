import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FeatureFlagsController } from '../http/feature-flags.controller.js';
import { ok, err, NotFoundError } from '../../../shared-kernel/domain/result.js';
import type { FeatureFlagRepositoryPort } from '../../domain/ports/outbound/feature-flag-repository.port.js';
import type { FeatureFlag } from '../../domain/model/feature-flag.js';
import type { Principal } from '../../../auth/domain/principal.js';

function makeRepo(overrides: Partial<FeatureFlagRepositoryPort> = {}): FeatureFlagRepositoryPort {
  return {
    listByOrg: vi.fn().mockResolvedValue([]),
    findByKey: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(ok(makeFlag())),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    ...overrides,
  };
}

function makeFlag(overrides: Partial<FeatureFlag> = {}): FeatureFlag {
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

function makeReq(organizationId = 'org-1'): { user: Principal } {
  return { user: { userId: 'u1', organizationId, role: 'ADMIN', subscriptionStatus: 'ACTIVE' } };
}

describe('FeatureFlagsController — unit', () => {
  let repo: FeatureFlagRepositoryPort;
  let controller: FeatureFlagsController;

  beforeEach(() => {
    repo = makeRepo();
    controller = new FeatureFlagsController(repo);
  });

  describe('list', () => {
    it('returns flags for org from repo', async () => {
      const flags = [makeFlag()];
      vi.mocked(repo.listByOrg).mockResolvedValue(flags);
      const result = await controller.list(makeReq() as never);
      expect(result).toEqual(flags);
      expect(repo.listByOrg).toHaveBeenCalledWith('org-1');
    });

    it('returns empty array when no flags', async () => {
      vi.mocked(repo.listByOrg).mockResolvedValue([]);
      const result = await controller.list(makeReq() as never);
      expect(result).toEqual([]);
    });
  });

  describe('upsert', () => {
    it('creates flag with enabled=true', async () => {
      const flag = makeFlag({ enabled: true });
      vi.mocked(repo.upsert).mockResolvedValue(ok(flag));
      const result = await controller.upsert(makeReq() as never, 'dark_mode', { enabled: true });
      expect(result).toEqual(flag);
      expect(repo.upsert).toHaveBeenCalledWith('org-1', 'dark_mode', true, {});
    });

    it('creates flag with custom payload', async () => {
      const flag = makeFlag({ payload: { threshold: 5 } });
      vi.mocked(repo.upsert).mockResolvedValue(ok(flag));
      await controller.upsert(makeReq() as never, 'my-flag', { enabled: false, payload: { threshold: 5 } });
      expect(repo.upsert).toHaveBeenCalledWith('org-1', 'my-flag', false, { threshold: 5 });
    });

    it('throws BadRequestException when enabled is missing', async () => {
      await expect(controller.upsert(makeReq() as never, 'k', {})).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when enabled is not boolean', async () => {
      await expect(controller.upsert(makeReq() as never, 'k', { enabled: 'yes' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deletes flag successfully', async () => {
      vi.mocked(repo.delete).mockResolvedValue(ok(undefined));
      await expect(controller.remove(makeReq() as never, 'dark_mode')).resolves.toBeUndefined();
      expect(repo.delete).toHaveBeenCalledWith('org-1', 'dark_mode');
    });

    it('throws NotFoundException when flag not found', async () => {
      vi.mocked(repo.delete).mockResolvedValue(err(new NotFoundError('FeatureFlag', 'missing')));
      await expect(controller.remove(makeReq() as never, 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
