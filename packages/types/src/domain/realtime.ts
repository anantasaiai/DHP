/**
 * §2.2 Real-Time Update Layer — SSE + Redis Pub/Sub
 *
 * Channel naming (tenant-scoped by construction):
 *   availability:{organization_id}:{host_id}  — public slot updates
 *   dashboard:{organization_id}:{user_id}     — authenticated per-member dashboard
 *   dashboard:{organization_id}:admin         — org-rollup admin view
 *
 * Governing rule: real-time is push notification only, never a write path.
 * Events trigger a re-fetch (queryClient.invalidateQueries); they never
 * directly mutate client state.
 */

export type RealtimeEventType =
  | 'SLOT_UNAVAILABLE'
  | 'SLOT_AVAILABLE'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_RESCHEDULED';

export interface RealtimeEvent {
  readonly type: RealtimeEventType;
  readonly organizationId: string;
  readonly payload: Record<string, unknown>;
  readonly timestamp: string; // ISO-8601
}

/** §2.2 channel name helpers — encode the isolation boundary so a subscription can never technically reach across it. */
export const RealtimeChannels = {
  availability: (organizationId: string, hostId: string): string =>
    `availability:${organizationId}:${hostId}`,
  dashboardUser: (organizationId: string, userId: string): string =>
    `dashboard:${organizationId}:${userId}`,
  dashboardAdmin: (organizationId: string): string =>
    `dashboard:${organizationId}:admin`,
} as const;
