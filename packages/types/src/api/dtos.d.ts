import type { BookingStatus, ConferencingType } from '../domain/booking.js';
import type { MemberRole, MembershipStatus } from '../domain/organization.js';
export interface CreateBookingDto {
    readonly meetingTypeId: string;
    readonly hostId: string;
    readonly guestEmail: string;
    readonly guestName: string;
    readonly startsAt: string;
    readonly answersJson?: Record<string, unknown>;
    readonly idempotencyKey: string;
}
export interface BookingResponseDto {
    readonly id: string;
    readonly organizationId: string;
    readonly hostId: string;
    readonly meetingTypeId: string;
    readonly guestEmail: string;
    readonly guestName: string;
    readonly timeRange: {
        readonly startsAt: string;
        readonly endsAt: string;
    };
    readonly status: BookingStatus;
    readonly joinUrl: string | null;
    readonly createdAt: string;
}
export interface GetSlotsQueryDto {
    readonly hostId: string;
    readonly meetingTypeId: string;
    readonly dateFrom: string;
    readonly dateTo: string;
    readonly timezone: string;
}
export interface SlotDto {
    readonly startsAt: string;
    readonly endsAt: string;
    readonly available: boolean;
}
export interface CreateMeetingTypeDto {
    readonly slug: string;
    readonly name: string;
    readonly durationMinutes: number;
    readonly conferencingType: ConferencingType;
    readonly bufferBeforeMinutes?: number;
    readonly bufferAfterMinutes?: number;
    readonly minNoticeMinutes?: number;
    readonly maxDaysInFuture?: number;
    readonly maxPerDay?: number | null;
}
export interface CreateOrganizationDto {
    readonly name: string;
    readonly slug: string;
}
export interface InviteMemberDto {
    readonly email: string;
    readonly role: MemberRole;
}
export interface MembershipResponseDto {
    readonly id: string;
    readonly organizationId: string;
    readonly userId: string;
    readonly role: MemberRole;
    readonly status: MembershipStatus;
    readonly invitedEmail: string;
    readonly createdAt: string;
}
//# sourceMappingURL=dtos.d.ts.map