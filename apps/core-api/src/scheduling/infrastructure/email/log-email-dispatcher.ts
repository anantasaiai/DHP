import { Injectable, Logger } from '@nestjs/common';
import type { EmailDispatcherPort, EmailPayload } from '../../domain/ports/outbound/email-dispatcher.port.js';
import { EMAIL_DISPATCHER_PORT } from '../../domain/ports/outbound/email-dispatcher.port.js';

/**
 * Stub email dispatcher that logs payloads to stdout.
 * // TODO: swap this binding for SesEmailDispatcher or SendGridEmailDispatcher
 */
@Injectable()
export class LogEmailDispatcher implements EmailDispatcherPort {
  private readonly logger = new Logger(LogEmailDispatcher.name);

  async send(payload: EmailPayload): Promise<void> {
    this.logger.log(JSON.stringify(payload));
  }
}

export { EMAIL_DISPATCHER_PORT };
