"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeChannels = void 0;
/** §2.2 channel name helpers — encode the isolation boundary so a subscription can never technically reach across it. */
exports.RealtimeChannels = {
    availability: (organizationId, hostId) => `availability:${organizationId}:${hostId}`,
    dashboardUser: (organizationId, userId) => `dashboard:${organizationId}:${userId}`,
    dashboardAdmin: (organizationId) => `dashboard:${organizationId}:admin`,
};
//# sourceMappingURL=realtime.js.map