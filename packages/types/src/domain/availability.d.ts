import type { OrganizationId, UserId } from './organization.js';
export type AvailabilityScheduleId = string & {
    readonly _brand: 'AvailabilityScheduleId';
};
export type AvailabilityOverrideId = string & {
    readonly _brand: 'AvailabilityOverrideId';
};
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface WeeklyRule {
    readonly dayOfWeek: DayOfWeek;
    readonly startTime: string;
    readonly endTime: string;
}
export interface AvailabilitySchedule {
    readonly id: AvailabilityScheduleId;
    readonly organizationId: OrganizationId;
    readonly ownerUserId: UserId;
    readonly name: string;
    readonly timezone: string;
    readonly weeklyRules: WeeklyRule[];
    readonly isDefault: boolean;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}
export interface AvailabilityOverride {
    readonly id: AvailabilityOverrideId;
    readonly organizationId: OrganizationId;
    readonly ownerUserId: UserId;
    readonly date: string;
    readonly available: boolean;
    readonly startTime: string | null;
    readonly endTime: string | null;
    readonly reason: string | null;
}
export interface AvailabilityInterval {
    readonly startsAt: Date;
    readonly endsAt: Date;
}
export interface FreeBusyBlock {
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly source: 'external_calendar' | 'dhp_booking';
}
//# sourceMappingURL=availability.d.ts.map