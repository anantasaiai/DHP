import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { EventPublisherPort, DomainEvent } from '../../domain/ports/outbound/event-publisher.port.js';
import { PrismaService } from '../../../shared-kernel/infrastructure/persistence/prisma.service.js';

/**
 * Writes domain events to the outbox table in the SAME transaction as the
 * state change (§9.1 transactional outbox — no dual-write).
 * A separate BullMQ drain worker reads and dispatches them.
 */
@Injectable()
export class OutboxEventPublisher implements EventPublisherPort {
  private readonly logger = new Logger(OutboxEventPublisher.name);

  constructor(private readonly prisma: PrismaService) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.prisma.outbox.create({
      data: {
        organizationId: event.organizationId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payloadJson: event.payload as Prisma.InputJsonValue,
        idempotencyKey: event.idempotencyKey,
        nextAttemptAt: new Date(),
      },
    });
    this.logger.debug(`Outbox record written: ${event.eventType} for ${event.aggregateId}`);
  }
}
