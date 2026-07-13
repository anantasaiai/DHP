import type { OrganizationId, UserId } from './organization.js';

export type BookingId = string & { readonly _brand: 'BookingId' };
export type MeetingTypeId = string & { readonly _brand: 'MeetingTypeId' };

export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'PENDING';
export type ConferencingType = 'google_meet' | 'zoom' | 'teams' | 'webex' | 'custom';

export interface TimeRange {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface Booking {
  readonly id: BookingId;
  readonly organizationId: OrganizationId;
  readonly hostId: UserId;
  readonly meetingTypeId: MeetingTypeId;
  readonly guestEmail: string;
  readonly guestName: string;
  readonly timeRange: TimeRange;
  readonly status: BookingStatus;
  readonly joinUrl: string | null;
  readonly answersJson: Record<string, unknown>;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MeetingType {
  readonly id: MeetingTypeId;
  readonly organizationId: OrganizationId;
  readonly ownerUserId: UserId;
  readonly slug: string;
  readonly name: string;
  readonly durationMinutes: number;
  readonly conferencingType: ConferencingType;
  readonly bufferConfigJson: BufferConfig;
  readonly questionsJson: MeetingQuestion[];
  readonly minNoticeMinutes: number;
  readonly maxDaysInFuture: number;
  readonly maxPerDay: number | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BufferConfig {
  readonly beforeMinutes: number;
  readonly afterMinutes: number;
}

export interface MeetingQuestion {
  readonly id: string;
  readonly label: string;
  readonly type: 'text' | 'select' | 'multiselect' | 'checkbox';
  readonly required: boolean;
  readonly options?: string[];
}
