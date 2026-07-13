import type { Result } from '../../../../shared-kernel/domain/result.js';
import type { DomainError } from '../../../../shared-kernel/domain/result.js';
import type { OrgMember } from '../../model/org-member.js';

export interface OrgMemberRepositoryPort {
  findById(id: string): Promise<OrgMember | null>;
  findByOrgAndUser(organizationId: string, userId: string): Promise<OrgMember | null>;
  findByInviteToken(token: string): Promise<OrgMember | null>;
  linkUser(membershipId: string, userId: string): Promise<Result<OrgMember, DomainError>>;
  findActiveByOrg(organizationId: string): Promise<OrgMember[]>;
  findActiveByOrgWithUser(organizationId: string): Promise<(OrgMember & { userEmail: string | null; username: string | null })[]>;
  countAdminsByOrg(organizationId: string): Promise<number>;
  save(membership: OrgMember): Promise<Result<OrgMember, DomainError>>;
  updateStatus(id: string, organizationId: string, status: OrgMember['status']): Promise<Result<OrgMember, DomainError>>;
  updateRole(id: string, organizationId: string, role: OrgMember['role']): Promise<Result<OrgMember, DomainError>>;
  listAdminsByOrg(organizationId: string): Promise<OrgMember[]>;
  assignAdmin(organizationId: string, userId: string, invitedEmail: string): Promise<Result<OrgMember, DomainError>>;
  revokeAdmin(organizationId: string, userId: string): Promise<Result<void, DomainError>>;
}

export const ORG_MEMBER_REPOSITORY_PORT = Symbol('OrgMemberRepositoryPort');
