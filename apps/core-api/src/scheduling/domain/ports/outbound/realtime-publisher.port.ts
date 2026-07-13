/**
 * §2.2 RealtimePublisherPort — outbound port for SSE + Redis Pub/Sub fan-out.
 *
 * Governing rules:
 * - Real-time is push notification only, never a write path.
 * - Published at commit time alongside the existing EventPublisherPort event —
 *   no separate business logic, no new write path.
 * - Channel names encode the tenant boundary (org-scoped by construction).
 * - A lost or duplicated message can never cause a double-booking; it produces
 *   only a momentarily stale UI, which the client's next REST re-fetch corrects.
 */

export interface RealtimePayload {
  readonly type: string;
  readonly organizationId: string;
  readonly payload: Record<string, unknown>;
  readonly timestamp: string; // ISO-8601
}

export interface RealtimePublisherPort {
  /**
   * Publish an event to a Redis Pub/Sub channel.
   * The channel name must be derived from RealtimeChannels helpers to guarantee
   * tenant isolation by construction.
   */
  publish(channel: string, event: RealtimePayload): Promise<void>;
}

export const REALTIME_PUBLISHER_PORT = Symbol('RealtimePublisherPort');

/** §2.2 channel name factory — isolation boundary encoded in the name. */
export const RealtimeChannels = {
  /** Public slot availability updates for a specific host's meeting type page. */
  availability: (organizationId: string, hostId: string): string =>
    `availability:${organizationId}:${hostId}`,
  /** Authenticated per-member dashboard updates. */
  dashboardUser: (organizationId: string, userId: string): string =>
    `dashboard:${organizationId}:${userId}`,
  /** Org-rollup view for Admin role. */
  dashboardAdmin: (organizationId: string): string =>
    `dashboard:${organizationId}:admin`,
} as const;
