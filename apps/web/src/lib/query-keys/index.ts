/**
 * Centralized query-key factory (§3 TanStack Query discipline).
 */
export const queryKeys = {
  bookings: {
    all: ['bookings'] as const,
    byHost: (hostId: string) => ['bookings', 'host', hostId] as const,
    detail: (id: string) => ['bookings', id] as const,
  },
  slots: {
    available: (
      orgSlug: string,
      username: string,
      meetingSlug: string,
      dateFrom: string,
      dateTo: string,
      tz: string,
    ) => ['slots', orgSlug, username, meetingSlug, dateFrom, dateTo, tz] as const,
  },
  meetingTypes: {
    all: ['meetingTypes'] as const,
    detail: (id: string) => ['meetingTypes', id] as const,
  },
  organization: {
    current: ['organization', 'current'] as const,
    members: ['organization', 'members'] as const,
  },
  dashboard: {
    metrics: ['dashboard', 'metrics'] as const,
    adminRollup: ['dashboard', 'admin', 'rollup'] as const,
  },
  organizations: {
    all: ['organizations'] as const,
    admins: (id: string) => ['organizations', id, 'admins'] as const,
  },
  members: {
    all: ['members'] as const,
  },
  featureFlags: {
    all: ['featureFlags'] as const,
  },
  schedules: {
    all: ['schedules'] as const,
  },
  overrides: {
    all: ['overrides'] as const,
  },
  availabilitySlots: ['availabilitySlots'] as const,
} as const;
