import { api } from './client.js';

export interface FeatureFlagDto {
  id: string;
  key: string;
  enabled: boolean;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
}

export const listFeatureFlags = () => api.get<FeatureFlagDto[]>('/feature-flags');
export const upsertFeatureFlag = (
  key: string,
  p: { enabled: boolean; payload?: unknown },
) => api.put<FeatureFlagDto>(`/feature-flags/${key}`, p);
export const deleteFeatureFlag = (key: string) => api.delete(`/feature-flags/${key}`);
