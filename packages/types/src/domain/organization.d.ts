export type OrganizationId = string & {
    readonly _brand: 'OrganizationId';
};
export type UserId = string & {
    readonly _brand: 'UserId';
};
export type MembershipId = string & {
    readonly _brand: 'MembershipId';
};
export type MemberRole = 'ADMIN' | 'MEMBER';
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'REMOVED';
/** §7A.4a gate 0. Written only by billing-provider webhook handler; never set by app code. */
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
export interface Organization {
    readonly id: OrganizationId;
    readonly slug: string;
    readonly name: string;
    readonly brandingJson: Record<string, unknown> | null;
    readonly senderDisplayName: string | null;
    /** §7A.4a — check before any org-isolation or ownership check. */
    readonly subscriptionStatus: SubscriptionStatus;
    readonly subscriptionExpiresAt: Date | null;
    readonly billingProviderCustomerId: string | null;
    readonly deletedAt: Date | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}
export declare function isSubscriptionActive(org: Pick<Organization, 'subscriptionStatus'>): boolean;
export interface Membership {
    readonly id: MembershipId;
    readonly organizationId: OrganizationId;
    readonly userId: UserId;
    readonly role: MemberRole;
    readonly status: MembershipStatus;
    readonly invitedBy: UserId | null;
    readonly invitedEmail: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}
export interface User {
    readonly id: UserId;
    readonly username: string;
    readonly email: string;
    readonly timezone: string;
    readonly preferencesJson: Record<string, unknown>;
    readonly deletedAt: Date | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}
export interface Principal {
    readonly userId: UserId;
    readonly organizationId: OrganizationId;
    readonly role: MemberRole;
    /** Included so the JWT guard can enforce §7A.4a without a second DB round-trip. */
    readonly subscriptionStatus: SubscriptionStatus;
}
//# sourceMappingURL=organization.d.ts.map