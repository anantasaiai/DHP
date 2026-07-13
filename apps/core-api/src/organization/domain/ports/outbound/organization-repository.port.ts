import type { Result } from '../../../../shared-kernel/domain/result.js';
import type { DomainError } from '../../../../shared-kernel/domain/result.js';
import type { Organization } from '../../model/organization.js';

export interface DashboardStats {
  totalOrganizations: number;
  totalUsers: number;
  totalBookings: number;
  activeSubscriptions: number;
  bookingsThisMonth: number;
}

export interface OrganizationRepositoryPort {
  findById(id: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  slugExists(slug: string): Promise<boolean>;
  listAll(page: number, limit: number): Promise<{ items: Organization[]; total: number }>;
  getDashboardStats(): Promise<DashboardStats>;
  save(org: Organization): Promise<Result<Organization, DomainError>>;
  update(
    id: string,
    patch: Partial<Pick<Organization, 'name' | 'slug' | 'brandingJson' | 'senderDisplayName'>>,
  ): Promise<Result<Organization, DomainError>>;
  softDelete(id: string): Promise<Result<void, DomainError>>;
}

export const ORGANIZATION_REPOSITORY_PORT = Symbol('OrganizationRepositoryPort');
