export interface DomainEvent {
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly organizationId: string;
  readonly payload: Record<string, unknown>;
  readonly idempotencyKey: string;
}

export interface EventPublisherPort {
  publish(event: DomainEvent): Promise<void>;
}

export const EVENT_PUBLISHER_PORT = Symbol('EventPublisherPort');

// Well-known event types
export const BOOKING_EVENTS = {
  CONFIRMED: 'BOOKING_CONFIRMED',
  CANCELLED: 'BOOKING_CANCELLED',
  RESCHEDULED: 'BOOKING_RESCHEDULED',
  REMINDER_SCHEDULED: 'BOOKING_REMINDER_SCHEDULED',
} as const;
