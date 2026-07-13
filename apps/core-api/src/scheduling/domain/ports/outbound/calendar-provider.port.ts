import type { TimeRange } from '../../model/time-range.js';

export interface FreeBusyQuery {
  readonly ownerUserId: string;
  readonly organizationId: string;
  readonly windowFrom: Date;
  readonly windowTo: Date;
}

export interface FreeBusyBlock {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly source: string;
}

export interface ProjectEventInput {
  readonly ownerUserId: string;
  readonly organizationId: string;
  readonly bookingId: string;
  readonly title: string;
  readonly timeRange: TimeRange;
  readonly guestEmail: string;
  readonly joinUrl: string | null;
  readonly idempotencyKey: string;
}

export interface CalendarProviderPort {
  getFreeBusy(query: FreeBusyQuery): Promise<FreeBusyBlock[]>;
  projectEvent(input: ProjectEventInput): Promise<void>;
  deleteEvent(ownerUserId: string, organizationId: string, bookingId: string): Promise<void>;
}

export const CALENDAR_PROVIDER_PORT = Symbol('CalendarProviderPort');
