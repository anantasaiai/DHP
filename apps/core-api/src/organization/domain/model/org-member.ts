export type MemberRole = 'SUPER_ADMIN' | 'ADMIN' | 'MAINTAINER' | 'MEMBER';
export type OrgMemberStatus = 'INVITED' | 'ACTIVE' | 'REMOVED';

export interface OrgMember {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string | null;   // null until invite accepted
  readonly role: MemberRole;
  readonly status: OrgMemberStatus;
  readonly invitedBy: string | null;
  readonly invitedEmail: string;
  readonly inviteToken: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserProfile {
  readonly id: string;          // = OIDC sub
  readonly organizationId: string;
  readonly username: string;
  readonly email: string;
  readonly timezone: string;    // IANA
  readonly preferencesJson: Record<string, unknown>;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function isActiveMember(m: OrgMember): boolean {
  return m.status === 'ACTIVE';
}
