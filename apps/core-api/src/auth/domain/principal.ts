import type { MemberRole, SubscriptionStatus } from '@dhp/types';

export interface Principal {
  readonly userId: string;
  readonly organizationId: string | null; // null for SUPER_ADMIN
  readonly role: MemberRole;
  /** §7A.4a — subscription gate 0, resolved at auth time to avoid a second DB round-trip. */
  readonly subscriptionStatus: SubscriptionStatus;
  readonly username: string | null;
  readonly email: string | null;
}
