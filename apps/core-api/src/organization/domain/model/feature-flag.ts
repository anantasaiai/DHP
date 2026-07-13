export interface FeatureFlag {
  readonly id: string;
  readonly organizationId: string;
  readonly key: string;
  readonly enabled: boolean;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
