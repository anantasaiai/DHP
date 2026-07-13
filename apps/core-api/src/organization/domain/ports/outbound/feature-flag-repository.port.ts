import type { FeatureFlag } from '../../model/feature-flag.js';
import type { Result, DomainError } from '../../../../shared-kernel/domain/result.js';

export interface FeatureFlagRepositoryPort {
  listByOrg(organizationId: string): Promise<FeatureFlag[]>;
  findByKey(organizationId: string, key: string): Promise<FeatureFlag | null>;
  upsert(organizationId: string, key: string, enabled: boolean, payload: Record<string, unknown>): Promise<Result<FeatureFlag, DomainError>>;
  delete(organizationId: string, key: string): Promise<Result<void, DomainError>>;
}

export const FEATURE_FLAG_REPOSITORY_PORT = Symbol('FeatureFlagRepositoryPort');
