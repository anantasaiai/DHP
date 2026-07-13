import { Injectable } from '@nestjs/common';
import type { MeetingProviderPort, ProvisionMeetingLinkInput } from '../../domain/ports/outbound/meeting-provider.port.js';
import { MEETING_PROVIDER_PORT } from '../../domain/ports/outbound/meeting-provider.port.js';

/**
 * No-op meeting provider. No meeting link is generated.
 * Wire ZoomMeetingProvider, GoogleMeetProvider, or TeamsMeetingProvider once OAuth tokens exist.
 */
@Injectable()
export class NoOpMeetingProvider implements MeetingProviderPort {
  async provisionLink(_input: ProvisionMeetingLinkInput): Promise<string> {
    return '';
  }

  async deleteLink(_ownerUserId: string, _organizationId: string, _bookingId: string): Promise<void> {
    // no-op
  }
}

export { MEETING_PROVIDER_PORT };
