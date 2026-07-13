import { Injectable } from '@nestjs/common';
import type {
  CalendarProviderPort,
  FreeBusyQuery,
  FreeBusyBlock,
  ProjectEventInput,
} from '../../domain/ports/outbound/calendar-provider.port.js';
import { CALENDAR_PROVIDER_PORT } from '../../domain/ports/outbound/calendar-provider.port.js';

/**
 * No-op calendar provider. No external calendar is connected.
 * Wire GoogleCalendarProvider or MicrosoftCalendarProvider once OAuth tokens exist.
 */
@Injectable()
export class NoOpCalendarProvider implements CalendarProviderPort {
  async getFreeBusy(_query: FreeBusyQuery): Promise<FreeBusyBlock[]> {
    return [];
  }

  async projectEvent(_input: ProjectEventInput): Promise<void> {
    // no-op
  }

  async deleteEvent(_ownerUserId: string, _organizationId: string, _bookingId: string): Promise<void> {
    // no-op
  }
}

export { CALENDAR_PROVIDER_PORT };
