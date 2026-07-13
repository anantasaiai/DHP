import type { TimeRange } from '../../model/time-range.js';

export interface ProvisionMeetingLinkInput {
  readonly ownerUserId: string;
  readonly organizationId: string;
  readonly bookingId: string;
  readonly title: string;
  readonly timeRange: TimeRange;
  readonly guestEmail: string;
  readonly idempotencyKey: string;
}

export interface MeetingProviderPort {
  provisionLink(input: ProvisionMeetingLinkInput): Promise<string>;
  deleteLink(ownerUserId: string, organizationId: string, bookingId: string): Promise<void>;
}

export const MEETING_PROVIDER_PORT = Symbol('MeetingProviderPort');
